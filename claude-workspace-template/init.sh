#!/usr/bin/env bash
set -euo pipefail

###############################################################################
# init.sh — Claude Workspace Template Installer
#
# Installs or updates the .claude/ workspace configuration in a target project.
# Reads claude-workspace.yaml for project settings, copies core files, merges
# selected addons, generates CLAUDE.md, settings.json, and registries.
#
# Usage:
#   init.sh [OPTIONS] [TARGET_DIR]
#
# Options:
#   --config FILE    Path to claude-workspace.yaml (default: TARGET_DIR/claude-workspace.yaml)
#   --update         Update existing installation (safe re-init)
#   --addons LIST    Comma-separated addon list (overrides config file)
#   --help           Show help message
#
# TARGET_DIR defaults to current directory.
###############################################################################

# -- Constants ----------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CORE_DIR="$SCRIPT_DIR/core"
ADDONS_DIR="$SCRIPT_DIR/addons"
VERSION="1.0.0"
_UPDATE_TMP_DIR=""  # Global for trap cleanup (set in perform_update)

# Colors (disabled if not a terminal)
if [ -t 1 ]; then
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  RED='\033[0;31m'
  BLUE='\033[0;34m'
  BOLD='\033[1m'
  NC='\033[0m'
else
  GREEN='' YELLOW='' RED='' BLUE='' BOLD='' NC=''
fi

# -- Helpers ------------------------------------------------------------------

log_info()    { echo -e "${GREEN}[INFO]${NC} $*"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $*"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $*" >&2; }
log_section() { echo -e "\n${BLUE}${BOLD}==> $*${NC}"; }

# Cross-platform md5 hash (macOS: md5 -q, Linux: md5sum)
file_hash() {
  local file="$1"
  if command -v md5 &>/dev/null; then
    md5 -q "$file"
  elif command -v md5sum &>/dev/null; then
    md5sum "$file" | cut -d' ' -f1
  else
    log_error "No md5 or md5sum command found"
    return 1
  fi
}

# Parse a simple YAML value: parse_yaml_value "key" < file
# Handles: key: "value", key: 'value', key: value
parse_yaml_value() {
  local key="$1" file="$2"
  local val
  val=$(grep -E "^[[:space:]]*${key}:" "$file" | head -1 | sed -E "s/^[[:space:]]*${key}:[[:space:]]*//" | sed -E 's/^["'\''](.*)['\''"]$/\1/' | sed 's/#.*//' | xargs)
  echo "$val"
}

# Parse a YAML list under a key (indented with "- " items)
parse_yaml_list() {
  local key="$1" file="$2"
  local in_section=false
  while IFS= read -r line; do
    if [[ "$line" =~ ^[[:space:]]*${key}: ]]; then
      in_section=true
      continue
    fi
    if $in_section; then
      # Stop at next top-level key or empty unindented line
      if [[ "$line" =~ ^[a-zA-Z] ]] || [[ -z "$line" && "$in_section" == "true" ]]; then
        # Empty line might be between sections - peek ahead
        if [[ -z "$line" ]]; then
          continue
        fi
        break
      fi
      if [[ "$line" =~ ^[[:space:]]*-[[:space:]]+(.*) ]]; then
        local item="${BASH_REMATCH[1]}"
        # Strip quotes and comments
        item=$(echo "$item" | sed -E 's/^["'\''](.*)['\''"]$/\1/' | sed 's/#.*//' | xargs)
        if [[ -n "$item" ]]; then
          echo "$item"
        fi
      fi
    fi
  done < "$file"
}

# List available addons from the addons directory
list_available_addons() {
  local i=1
  for dir in "$ADDONS_DIR"/*/; do
    if [ -d "$dir" ]; then
      local name
      name=$(basename "$dir")
      echo "  $i) $name"
      i=$((i + 1))
    fi
  done
}

# Get addon name by number
get_addon_by_number() {
  local num="$1" i=1
  for dir in "$ADDONS_DIR"/*/; do
    if [ -d "$dir" ]; then
      if [ "$i" -eq "$num" ]; then
        basename "$dir"
        return 0
      fi
      i=$((i + 1))
    fi
  done
  return 1
}

# Get total number of available addons
get_addon_count() {
  local count=0
  for dir in "$ADDONS_DIR"/*/; do
    [ -d "$dir" ] && count=$((count + 1))
  done
  echo "$count"
}

show_help() {
  cat <<'HELP'
Claude Workspace Template Installer

Usage: init.sh [OPTIONS] [TARGET_DIR]

Options:
  --config FILE    Path to claude-workspace.yaml
                   (default: TARGET_DIR/claude-workspace.yaml)
  --update         Update existing installation (safe re-init with backup)
  --addons LIST    Comma-separated addon list (overrides config file)
  --help           Show this help message

TARGET_DIR defaults to current directory.

Examples:
  # Fresh install (interactive)
  ./init.sh /path/to/my-project

  # Install with specific config
  ./init.sh --config ./my-config.yaml /path/to/my-project

  # Update existing installation
  ./init.sh --update /path/to/my-project

  # Override addons from command line
  ./init.sh --addons react-typescript,eval-system /path/to/my-project
HELP
}

# -- Interactive Config Creation ----------------------------------------------

create_config_interactive() {
  local config_file="$1"

  log_section "Interactive Configuration"
  echo "No claude-workspace.yaml found. Let's create one!"
  echo ""

  # Project name
  local project_name=""
  read -rp "Project name: " project_name
  project_name="${project_name:-my-project}"

  # Project description
  local project_desc=""
  read -rp "Project description: " project_desc
  project_desc="${project_desc:-A project configured with Claude Workspace}"

  # Language
  local language=""
  echo ""
  echo "Language options:"
  echo "  1) ko (Korean)"
  echo "  2) en (English)"
  echo "  3) ja (Japanese)"
  read -rp "Language [2]: " language
  case "$language" in
    1|ko) language="ko" ;;
    3|ja) language="ja" ;;
    *)    language="en" ;;
  esac

  # Addons
  echo ""
  echo "Available addons:"
  list_available_addons
  echo ""
  local addon_count
  addon_count=$(get_addon_count)
  read -rp "Select addons (comma-separated numbers, or empty for none): " addon_input
  local selected_addons=()
  if [[ -n "$addon_input" ]]; then
    IFS=',' read -ra addon_nums <<< "$addon_input"
    for num in "${addon_nums[@]}"; do
      num=$(echo "$num" | xargs)  # trim whitespace
      if [[ "$num" =~ ^[0-9]+$ ]] && [ "$num" -ge 1 ] && [ "$num" -le "$addon_count" ]; then
        local addon_name
        addon_name=$(get_addon_by_number "$num")
        selected_addons+=("$addon_name")
      else
        log_warn "Invalid addon number: $num (skipping)"
      fi
    done
  fi

  # Commands
  echo ""
  echo "Build/test commands (leave empty to skip):"
  local cmd_typecheck="" cmd_lint="" cmd_test="" cmd_build="" cmd_format=""
  read -rp "  typecheck (e.g. 'npx tsc --noEmit'): " cmd_typecheck
  read -rp "  lint (e.g. 'npx eslint .'): " cmd_lint
  read -rp "  test (e.g. 'npm test'): " cmd_test
  read -rp "  build (e.g. 'npm run build'): " cmd_build
  read -rp "  format (e.g. 'npx prettier --write'): " cmd_format

  # Write config file
  cat > "$config_file" <<YAML
# claude-workspace.yaml — generated by init.sh
project:
  name: "${project_name}"
  description: "${project_desc}"
  language: "${language}"

# Active addons
addons:
YAML

  if [ ${#selected_addons[@]} -eq 0 ]; then
    echo "  # none selected" >> "$config_file"
  else
    for addon in "${selected_addons[@]}"; do
      echo "  - ${addon}" >> "$config_file"
    done
  fi

  cat >> "$config_file" <<YAML

# Source paths
paths:
  src: "src"
  tests: "tests"
  docs: "docs"

# Build/test commands (check-health, verify-app reference these)
commands:
  typecheck: "${cmd_typecheck}"
  lint: "${cmd_lint}"
  test: "${cmd_test}"
  build: "${cmd_build}"
  format: "${cmd_format}"

# Hook settings
hooks:
  ethical_validator: true
  auto_formatter: true
  context_monitor: true
  protected_paths:
    - ".env"
    - "secrets"
    - ".git/"
YAML

  log_info "Config saved to: $config_file"
  echo ""
}

# -- Core Installation --------------------------------------------------------

install_core() {
  local target_dir="$1"
  log_section "Installing Core"

  if [ ! -d "$CORE_DIR/.claude" ]; then
    log_error "Core directory not found: $CORE_DIR/.claude"
    exit 1
  fi

  # Create target .claude directory
  mkdir -p "$target_dir/.claude"

  # Copy core files (preserving directory structure)
  cp -r "$CORE_DIR/.claude/"* "$target_dir/.claude/"

  log_info "Core files installed to $target_dir/.claude/"
}

# -- Addon Merging ------------------------------------------------------------

merge_addon() {
  local addon_name="$1" target_dir="$2"
  local addon_dir="$ADDONS_DIR/$addon_name"

  if [ ! -d "$addon_dir" ]; then
    log_warn "Addon not found: $addon_name (skipping)"
    return 1
  fi

  log_info "Merging addon: $addon_name"

  # Standard directories to merge into .claude/
  local merge_dirs=("agents" "commands" "skills" "hooks")
  for dir in "${merge_dirs[@]}"; do
    if [ -d "$addon_dir/$dir" ]; then
      mkdir -p "$target_dir/.claude/$dir"
      cp -r "$addon_dir/$dir/"* "$target_dir/.claude/$dir/" 2>/dev/null || true
    fi
  done

  # Special directories that go directly into .claude/
  local special_dirs=("evals" "coordination")
  for dir in "${special_dirs[@]}"; do
    if [ -d "$addon_dir/$dir" ]; then
      mkdir -p "$target_dir/.claude/$dir"
      cp -r "$addon_dir/$dir/"* "$target_dir/.claude/$dir/"
    fi
  done

  return 0
}

install_addons() {
  local target_dir="$1"
  shift
  local addons=()
  if [ $# -gt 0 ]; then addons=("$@"); fi

  if [ ${#addons[@]} -eq 0 ]; then
    log_info "No addons selected"
    return
  fi

  log_section "Installing Addons"

  local addon_count=0
  for addon in ${addons[@]+"${addons[@]}"}; do
    if merge_addon "$addon" "$target_dir"; then
      addon_count=$((addon_count + 1))
    fi
  done

  log_info "$addon_count addon(s) merged"
}

# -- CLAUDE.md Generation ----------------------------------------------------

generate_claude_md() {
  local target_dir="$1" config_file="$2"
  shift 2
  local addons=()
  if [ $# -gt 0 ]; then addons=("$@"); fi

  log_section "Generating CLAUDE.md"

  local template="$CORE_DIR/CLAUDE.md.template"
  if [ ! -f "$template" ]; then
    log_error "CLAUDE.md.template not found: $template"
    return 1
  fi

  # Read config values
  local project_name project_desc
  project_name=$(parse_yaml_value "name" "$config_file")
  project_desc=$(parse_yaml_value "description" "$config_file")

  local cmd_typecheck cmd_lint cmd_test cmd_build cmd_format
  cmd_typecheck=$(parse_yaml_value "typecheck" "$config_file")
  cmd_lint=$(parse_yaml_value "lint" "$config_file")
  cmd_test=$(parse_yaml_value "test" "$config_file")
  cmd_build=$(parse_yaml_value "build" "$config_file")
  cmd_format=$(parse_yaml_value "format" "$config_file")

  # Default placeholders for empty commands
  : "${cmd_typecheck:=# TODO: configure typecheck command}"
  : "${cmd_lint:=# TODO: configure lint command}"
  : "${cmd_test:=# TODO: configure test command}"
  : "${cmd_build:=# TODO: configure build command}"
  : "${cmd_format:=# TODO: configure format command}"

  # Read the template
  local content
  content=$(<"$template")

  # Replace simple variables
  content="${content//\{\{project.name\}\}/$project_name}"
  content="${content//\{\{project.description\}\}/$project_desc}"
  content="${content//\{\{commands.typecheck\}\}/$cmd_typecheck}"
  content="${content//\{\{commands.lint\}\}/$cmd_lint}"
  content="${content//\{\{commands.test\}\}/$cmd_test}"
  content="${content//\{\{commands.build\}\}/$cmd_build}"
  content="${content//\{\{commands.format\}\}/$cmd_format}"

  # Process {{#if addon.X}} ... {{/if}} conditionals
  # Build a lookup set of active addons
  local active_addons_set=" "
  for a in ${addons[@]+"${addons[@]}"}; do
    active_addons_set+="$a "
  done

  # Process each conditional block
  # We use a line-by-line approach for robustness
  local output="" in_block=false block_active=false block_content=""
  while IFS= read -r line; do
    if [[ "$line" =~ \{\{#if\ addon\.([a-zA-Z0-9_-]+)\}\} ]]; then
      local addon_name="${BASH_REMATCH[1]}"
      in_block=true
      block_content=""
      if [[ "$active_addons_set" == *" $addon_name "* ]]; then
        block_active=true
      else
        block_active=false
      fi
      continue
    fi

    if [[ "$line" =~ \{\{/if\}\} ]]; then
      if $block_active; then
        output+="$block_content"
      fi
      in_block=false
      block_active=false
      block_content=""
      continue
    fi

    if $in_block; then
      block_content+="$line"$'\n'
    else
      output+="$line"$'\n'
    fi
  done <<< "$content"

  # Write the generated CLAUDE.md
  printf '%s' "$output" > "$target_dir/CLAUDE.md"

  log_info "CLAUDE.md generated at $target_dir/CLAUDE.md"
}

# -- Settings.json Merging ----------------------------------------------------

generate_settings_json() {
  local target_dir="$1"
  shift
  local addons=()
  if [ $# -gt 0 ]; then addons=("$@"); fi

  log_section "Generating settings.json"

  local base_settings="$target_dir/.claude/settings.json"
  if [ ! -f "$base_settings" ]; then
    log_error "Base settings.json not found: $base_settings"
    return 1
  fi

  # Collect hooks-patch.json files from active addons
  local patch_files=()
  for addon in ${addons[@]+"${addons[@]}"}; do
    local patch="$ADDONS_DIR/$addon/hooks-patch.json"
    if [ -f "$patch" ]; then
      patch_files+=("$patch")
    fi
  done

  if [ ${#patch_files[@]} -eq 0 ]; then
    log_info "No hooks patches to apply (core settings.json used as-is)"
    return
  fi

  # Use Node.js for safe JSON merging
  local patch_args=""
  for pf in "${patch_files[@]}"; do
    patch_args+="\"$pf\","
  done
  patch_args="${patch_args%,}"  # Remove trailing comma

  node -e "
const fs = require('fs');

// Read base settings
const base = JSON.parse(fs.readFileSync('$base_settings', 'utf8'));
const patchFiles = [${patch_args}];

for (const patchFile of patchFiles) {
  const patch = JSON.parse(fs.readFileSync(patchFile, 'utf8'));

  // Merge each hook event type
  for (const [event, entries] of Object.entries(patch)) {
    if (!base.hooks) base.hooks = {};
    if (!base.hooks[event]) base.hooks[event] = [];

    // Append each entry (avoid duplicates by checking command string)
    for (const entry of entries) {
      const entryCommands = entry.hooks.map(h => h.command);
      const isDuplicate = base.hooks[event].some(existing =>
        existing.hooks.some(h => entryCommands.includes(h.command))
      );
      if (!isDuplicate) {
        base.hooks[event].push(entry);
      }
    }
  }
}

fs.writeFileSync('$base_settings', JSON.stringify(base, null, 2) + '\\n');
"

  log_info "settings.json updated with ${#patch_files[@]} hook patch(es)"
}

# -- Registry Generation -----------------------------------------------------

generate_registries() {
  local target_dir="$1"

  log_section "Generating Registries"

  local agents_dir="$target_dir/.claude/agents"
  local commands_dir="$target_dir/.claude/commands"

  # Generate agents-registry.json
  node -e "
const fs = require('fs');
const path = require('path');

function extractDescription(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\\n');

  // Check for frontmatter description
  if (lines[0] && lines[0].trim() === '---') {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === '---') break;
      const match = lines[i].match(/^description:\\s*(.+)/);
      if (match) return match[1].trim();
    }
  }

  // Fallback: first markdown heading
  for (const line of lines) {
    const match = line.match(/^#+\\s+(.+)/);
    if (match) return match[1].trim();
  }

  return path.basename(filePath, '.md');
}

function scanDir(dir, type) {
  const registry = {};
  if (!fs.existsSync(dir)) return registry;

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && !fs.statSync(path.join(dir, f)).isDirectory());
  for (const file of files) {
    const name = path.basename(file, '.md');
    const filePath = path.join(dir, file);
    registry[name] = {
      file: '.claude/' + type + '/' + file,
      description: extractDescription(filePath)
    };
  }
  return registry;
}

// Agents
const agentsDir = '${agents_dir}';
const agentsRegistry = scanDir(agentsDir, 'agents');
fs.writeFileSync(
  path.join('${target_dir}', '.claude', 'agents-registry.json'),
  JSON.stringify(agentsRegistry, null, 2) + '\\n'
);
console.log('  agents-registry.json: ' + Object.keys(agentsRegistry).length + ' agent(s)');

// Commands
const commandsDir = '${commands_dir}';
const commandsRegistry = scanDir(commandsDir, 'commands');
fs.writeFileSync(
  path.join('${target_dir}', '.claude', 'commands-registry.json'),
  JSON.stringify(commandsRegistry, null, 2) + '\\n'
);
console.log('  commands-registry.json: ' + Object.keys(commandsRegistry).length + ' command(s)');
"

  log_info "Registries generated"
}

# -- Checksum Management ------------------------------------------------------

save_checksums() {
  local target_dir="$1"

  log_section "Saving Checksums"

  local checksum_file="$target_dir/.claude/.checksums"

  # Generate checksums for all files under .claude/
  # (excluding the checksum file itself and backups)
  : > "$checksum_file"
  find "$target_dir/.claude" -type f \
    ! -path "$target_dir/.claude/.checksums" \
    ! -path "$target_dir/.claude/backups/*" \
    | sort | while read -r f; do
    local hash
    hash=$(file_hash "$f")
    local rel_path="${f#$target_dir/}"
    echo "$hash $rel_path" >> "$checksum_file"
  done

  local count
  count=$(wc -l < "$checksum_file" | xargs)
  log_info "Checksums saved: $count files tracked"
}

# -- Update Mode ---------------------------------------------------------------

# Lookup a checksum from the .checksums file (bash 3.2 compatible, no assoc arrays)
lookup_checksum() {
  local rel_path="$1" checksum_file="$2"
  if [ -f "$checksum_file" ]; then
    grep " ${rel_path}$" "$checksum_file" 2>/dev/null | head -1 | cut -d' ' -f1
  fi
}

perform_update() {
  local target_dir="$1" config_file="$2"
  shift 2
  local addons=()
  if [ $# -gt 0 ]; then addons=("$@"); fi

  log_section "Update Mode"

  local claude_dir="$target_dir/.claude"
  local checksum_file="$claude_dir/.checksums"

  if [ ! -d "$claude_dir" ]; then
    log_error "No existing .claude/ directory found in $target_dir"
    log_error "Run without --update for fresh installation"
    exit 1
  fi

  # Step 1: Backup
  local backup_date
  backup_date=$(date +%Y-%m-%d_%H%M%S)
  local backup_dir="$claude_dir/backups/$backup_date"
  mkdir -p "$backup_dir"

  log_info "Backing up current .claude/ to backups/$backup_date/"

  # Copy everything except backups/ to the backup
  find "$claude_dir" -mindepth 1 -maxdepth 1 ! -name "backups" -exec cp -r {} "$backup_dir/" \;

  # Step 2: Verify checksums file
  if [ -f "$checksum_file" ]; then
    local checksum_count
    checksum_count=$(wc -l < "$checksum_file" | xargs)
    log_info "Loaded $checksum_count existing checksums"
  else
    log_warn "No existing checksums found. All files will be treated as new."
  fi

  # Step 3: Prepare new installation in a temp directory
  # Use a global variable for trap cleanup (local vars not accessible in EXIT trap)
  _UPDATE_TMP_DIR=$(mktemp -d)
  local tmp_dir="$_UPDATE_TMP_DIR"
  trap 'rm -rf "$_UPDATE_TMP_DIR" 2>/dev/null || true' EXIT

  mkdir -p "$tmp_dir/.claude"
  cp -r "$CORE_DIR/.claude/"* "$tmp_dir/.claude/"

  # Merge addons into temp
  for addon in ${addons[@]+"${addons[@]}"}; do
    merge_addon "$addon" "$tmp_dir" 2>/dev/null || true
  done

  # Step 4: Apply merge rules using Node.js for reliable processing
  # (avoids bash 3.2 associative array limitation and subshell variable scope issues)
  local update_summary
  update_summary=$(node -e "
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const tmpDir = '$tmp_dir';
const targetDir = '$target_dir';
const checksumFile = '$checksum_file';

// Load old checksums into a map
const checksums = {};
if (fs.existsSync(checksumFile)) {
  const lines = fs.readFileSync(checksumFile, 'utf8').trim().split('\\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const spaceIdx = line.indexOf(' ');
    if (spaceIdx > 0) {
      const hash = line.substring(0, spaceIdx);
      const relPath = line.substring(spaceIdx + 1);
      checksums[relPath] = hash;
    }
  }
}

// Helper to compute md5 hash
function fileHash(filePath) {
  try {
    // macOS
    return execSync('md5 -q ' + JSON.stringify(filePath), { encoding: 'utf8' }).trim();
  } catch(e) {
    try {
      // Linux
      return execSync('md5sum ' + JSON.stringify(filePath), { encoding: 'utf8' }).split(' ')[0].trim();
    } catch(e2) {
      return '';
    }
  }
}

// Recursively list files
function listFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results.sort();
}

let overwritten = 0, newFiles = 0, conflicts = 0, skipped = 0;
const warnings = [];

const newClaudeFiles = listFiles(path.join(tmpDir, '.claude'));

for (const newFile of newClaudeFiles) {
  const relPath = newFile.substring(tmpDir.length + 1);  // e.g., .claude/agents/foo.md
  const targetFile = path.join(targetDir, relPath);

  // Rule: agents/shared/* and hooks/*.js -> always overwrite
  if (relPath.startsWith('.claude/agents/shared/') || /^\\.claude\\/hooks\\/.*\\.js$/.test(relPath)) {
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.copyFileSync(newFile, targetFile);
    overwritten++;
    continue;
  }

  // Rule: File doesn't exist yet -> new, just copy
  if (!fs.existsSync(targetFile)) {
    fs.mkdirSync(path.dirname(targetFile), { recursive: true });
    fs.copyFileSync(newFile, targetFile);
    newFiles++;
    continue;
  }

  // File exists -> check if user has modified it
  const oldHash = checksums[relPath] || '';
  const currentHash = fileHash(targetFile);

  if (!oldHash || currentHash === oldHash) {
    // Unmodified (or no prior checksum): safe to overwrite
    fs.copyFileSync(newFile, targetFile);
    overwritten++;
  } else {
    // Modified by user: create .new file and warn
    fs.copyFileSync(newFile, targetFile + '.new');
    warnings.push('Conflict: ' + relPath + ' (modified locally)');
    warnings.push('  New version saved as: ' + relPath + '.new');
    conflicts++;
  }
}

// Output as JSON for bash to consume
console.log(JSON.stringify({ overwritten, newFiles, conflicts, skipped, warnings }));
")

  # Parse the summary
  local count_overwritten count_new_files count_conflicts count_skipped
  count_overwritten=$(echo "$update_summary" | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log(j.overwritten)})")
  count_new_files=$(echo "$update_summary" | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log(j.newFiles)})")
  count_conflicts=$(echo "$update_summary" | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log(j.conflicts)})")
  count_skipped=$(echo "$update_summary" | node -e "process.stdin.on('data',d=>{const j=JSON.parse(d);console.log(j.skipped)})")

  # Print warnings
  echo "$update_summary" | node -e "
    process.stdin.on('data', d => {
      const j = JSON.parse(d);
      j.warnings.forEach(w => console.log('\x1b[1;33m[WARN]\x1b[0m ' + w));
    });
  "

  # Step 5: Handle CLAUDE.md separately -- never overwrite, show diff hint
  local new_claude_md="$tmp_dir/CLAUDE.md"
  generate_claude_md "$tmp_dir" "$config_file" ${addons[@]+"${addons[@]}"} 2>/dev/null || true

  if [ -f "$target_dir/CLAUDE.md" ] && [ -f "$new_claude_md" ]; then
    if ! diff -q "$target_dir/CLAUDE.md" "$new_claude_md" &>/dev/null; then
      cp "$new_claude_md" "$target_dir/CLAUDE.md.new"
      log_warn "CLAUDE.md has template changes (not overwritten)"
      log_warn "  Review diff: diff $target_dir/CLAUDE.md $target_dir/CLAUDE.md.new"
    else
      log_info "CLAUDE.md is up to date (no changes)"
    fi
  elif [ ! -f "$target_dir/CLAUDE.md" ]; then
    generate_claude_md "$target_dir" "$config_file" ${addons[@]+"${addons[@]}"}
  fi

  # Step 6: Merge settings.json (keep existing + add new keys)
  local existing_settings="$target_dir/.claude/settings.json"
  local new_settings="$tmp_dir/.claude/settings.json"

  if [ -f "$existing_settings" ] && [ -f "$new_settings" ]; then
    # Generate the new settings with patches applied
    generate_settings_json "$tmp_dir" ${addons[@]+"${addons[@]}"} 2>/dev/null || true
    new_settings="$tmp_dir/.claude/settings.json"

    # Merge: keep existing, add new entries
    node -e "
const fs = require('fs');
const existing = JSON.parse(fs.readFileSync('$existing_settings', 'utf8'));
const incoming = JSON.parse(fs.readFileSync('$new_settings', 'utf8'));

// Merge hooks: keep existing entries, add new ones
if (incoming.hooks) {
  if (!existing.hooks) existing.hooks = {};
  for (const [event, entries] of Object.entries(incoming.hooks)) {
    if (!existing.hooks[event]) {
      existing.hooks[event] = entries;
    } else {
      for (const entry of entries) {
        const entryCommands = entry.hooks.map(h => h.command);
        const isDuplicate = existing.hooks[event].some(e =>
          e.hooks.some(h => entryCommands.includes(h.command))
        );
        if (!isDuplicate) {
          existing.hooks[event].push(entry);
        }
      }
    }
  }
}

// Merge top-level keys (keep existing, add new)
for (const [key, value] of Object.entries(incoming)) {
  if (key === 'hooks') continue;  // already handled
  if (!(key in existing)) {
    existing[key] = value;
  }
}

fs.writeFileSync('$existing_settings', JSON.stringify(existing, null, 2) + '\\n');
" 2>/dev/null || true
    log_info "settings.json merged (existing entries preserved)"
  fi

  # Step 7: Regenerate registries and checksums
  generate_registries "$target_dir"
  save_checksums "$target_dir"

  # Step 8: Print summary
  log_section "Update Summary"
  echo "  Backup:      backups/$backup_date/"
  echo "  Overwritten: $count_overwritten file(s)"
  echo "  New files:   $count_new_files file(s)"
  echo "  Conflicts:   $count_conflicts file(s) (review .new files)"
  echo "  Skipped:     $count_skipped file(s)"
  echo ""

  if [ "$count_conflicts" -gt 0 ]; then
    log_warn "Resolve conflicts by reviewing .new files and merging manually."
    log_warn "Then remove the .new files when done."
  fi

  log_info "Update complete!"
}

# -- Main Logic ---------------------------------------------------------------

main() {
  local config_file="" update_mode=false addons_override="" target_dir=""

  # Parse arguments
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --config)
        config_file="$2"
        shift 2
        ;;
      --update)
        update_mode=true
        shift
        ;;
      --addons)
        addons_override="$2"
        shift 2
        ;;
      --help|-h)
        show_help
        exit 0
        ;;
      -*)
        log_error "Unknown option: $1"
        show_help
        exit 1
        ;;
      *)
        target_dir="$1"
        shift
        ;;
    esac
  done

  # Default target directory
  target_dir="${target_dir:-.}"
  target_dir="$(cd "$target_dir" 2>/dev/null && pwd)" || {
    log_error "Target directory does not exist: $target_dir"
    exit 1
  }

  # Default config file location
  if [[ -z "$config_file" ]]; then
    config_file="$target_dir/claude-workspace.yaml"
  fi

  # Banner
  echo ""
  echo -e "${BOLD}Claude Workspace Template Installer v${VERSION}${NC}"
  echo "Template: $SCRIPT_DIR"
  echo "Target:   $target_dir"
  echo ""

  # Validate template directory
  if [ ! -d "$CORE_DIR" ]; then
    log_error "Core directory not found: $CORE_DIR"
    log_error "Are you running init.sh from the template directory?"
    exit 1
  fi

  # Interactive config creation if needed
  if [ ! -f "$config_file" ]; then
    if $update_mode; then
      log_error "Config file not found: $config_file"
      log_error "Cannot update without a config file"
      exit 1
    fi
    create_config_interactive "$config_file"
  else
    log_info "Using config: $config_file"
  fi

  # Read addons from config (or command-line override)
  local addons=()
  if [[ -n "$addons_override" ]]; then
    IFS=',' read -ra addons <<< "$addons_override"
    # Trim whitespace from each addon
    for i in "${!addons[@]}"; do
      addons[$i]=$(echo "${addons[$i]}" | xargs)
    done
    log_info "Addons (from --addons flag): ${addons[*]}"
  else
    while IFS= read -r addon; do
      addons+=("$addon")
    done < <(parse_yaml_list "addons" "$config_file")
    if [ ${#addons[@]} -gt 0 ]; then
      log_info "Addons (from config): ${addons[*]}"
    fi
  fi

  # Validate addons exist
  for addon in ${addons[@]+"${addons[@]}"}; do
    if [ ! -d "$ADDONS_DIR/$addon" ]; then
      log_error "Addon not found: $addon"
      log_error "Available addons: $(ls -1 "$ADDONS_DIR" | tr '\n' ' ')"
      exit 1
    fi
  done

  # Update mode
  if $update_mode; then
    perform_update "$target_dir" "$config_file" ${addons[@]+"${addons[@]}"}
    return
  fi

  # Fresh install: warn if .claude/ already exists
  if [ -d "$target_dir/.claude" ]; then
    log_warn "Existing .claude/ directory found in $target_dir"
    read -rp "Overwrite? (y/N): " confirm
    if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
      log_info "Aborted. Use --update for safe re-initialization."
      exit 0
    fi
  fi

  # Step 1: Install core
  install_core "$target_dir"

  # Step 2: Install addons
  if [ ${#addons[@]} -gt 0 ]; then
    install_addons "$target_dir" "${addons[@]}"
  fi

  # Step 3: Generate settings.json (merge hooks patches)
  if [ ${#addons[@]} -gt 0 ]; then
    generate_settings_json "$target_dir" "${addons[@]}"
  fi

  # Step 4: Generate CLAUDE.md
  generate_claude_md "$target_dir" "$config_file" ${addons[@]+"${addons[@]}"}

  # Step 5: Generate registries
  generate_registries "$target_dir"

  # Step 6: Save checksums
  save_checksums "$target_dir"

  # Done!
  log_section "Installation Complete!"
  echo ""
  echo "  Installed to: $target_dir/.claude/"
  echo "  CLAUDE.md:    $target_dir/CLAUDE.md"
  echo "  Config:       $config_file"
  echo ""
  echo "  Core agents:    $(ls -1 "$target_dir/.claude/agents/"*.md 2>/dev/null | wc -l | xargs)"
  echo "  Core commands:  $(ls -1 "$target_dir/.claude/commands/"*.md 2>/dev/null | wc -l | xargs)"
  echo "  Core skills:    $(find "$target_dir/.claude/skills" -name "SKILL.md" 2>/dev/null | wc -l | xargs)"
  if [ ${#addons[@]} -gt 0 ]; then
    echo "  Addons:         ${addons[*]}"
  else
    echo "  Addons:         none"
  fi
  echo ""
  echo "Next steps:"
  echo "  1. Review and customize CLAUDE.md"
  echo "  2. Fill in <!-- TODO --> sections with your project details"
  echo "  3. Start using Claude Code: claude"
  echo ""
  echo "To update later:"
  echo "  $SCRIPT_DIR/init.sh --update $target_dir"
  echo ""
}

# Run main with all arguments
main "$@"
