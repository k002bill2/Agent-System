/**
 * Git safety patterns - detect sensitive files that should not be committed.
 */

export type SensitivityLevel = 'danger' | 'warning' | 'safe'

export interface SensitivityResult {
  level: SensitivityLevel
  reason: string
}

/** Patterns for dangerous files (should never be committed) */
const DANGER_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\.env($|\.)/, reason: 'Environment variables file' },
  { pattern: /\.pem$/, reason: 'Private key file' },
  { pattern: /\.key$/, reason: 'Private key file' },
  { pattern: /\.p12$/, reason: 'Certificate file' },
  { pattern: /\.pfx$/, reason: 'Certificate file' },
  { pattern: /credentials\.json$/i, reason: 'Credentials file' },
  { pattern: /secrets?\.(json|ya?ml|toml)$/i, reason: 'Secrets file' },
  { pattern: /\.secret$/i, reason: 'Secret file' },
  { pattern: /id_rsa/, reason: 'SSH private key' },
  { pattern: /id_ed25519/, reason: 'SSH private key' },
  { pattern: /\.keystore$/, reason: 'Keystore file' },
  { pattern: /token\.json$/i, reason: 'Token file' },
  { pattern: /service[_-]?account.*\.json$/i, reason: 'Service account credentials' },
]

/** Patterns for warning files (usually not wanted in commits) */
const WARNING_PATTERNS: { pattern: RegExp; reason: string }[] = [
  { pattern: /\.sqlite3?$/, reason: 'SQLite database' },
  { pattern: /\.db$/, reason: 'Database file' },
  { pattern: /node_modules\//, reason: 'Node modules directory' },
  { pattern: /^__pycache__\/|__pycache__\//, reason: 'Python cache' },
  { pattern: /\.pyc$/, reason: 'Python bytecode' },
  { pattern: /\.DS_Store$/, reason: 'macOS metadata file' },
  { pattern: /Thumbs\.db$/, reason: 'Windows metadata file' },
  { pattern: /\.log$/, reason: 'Log file' },
  { pattern: /\.bak$/, reason: 'Backup file' },
  { pattern: /\.tmp$/, reason: 'Temporary file' },
  { pattern: /\.swp$/, reason: 'Vim swap file' },
  { pattern: /\.swo$/, reason: 'Vim swap file' },
  { pattern: /dist\//, reason: 'Build output directory' },
  { pattern: /build\//, reason: 'Build output directory' },
  { pattern: /\.idea\//, reason: 'IDE configuration' },
  { pattern: /\.vscode\/settings\.json/, reason: 'VS Code user settings' },
]

/**
 * Check if a file path is sensitive.
 */
export function checkSensitiveFile(filePath: string): SensitivityResult {
  const normalizedPath = filePath.replace(/\\/g, '/')

  for (const { pattern, reason } of DANGER_PATTERNS) {
    if (pattern.test(normalizedPath)) {
      return { level: 'danger', reason }
    }
  }

  for (const { pattern, reason } of WARNING_PATTERNS) {
    if (pattern.test(normalizedPath)) {
      return { level: 'warning', reason }
    }
  }

  return { level: 'safe', reason: '' }
}

/**
 * Batch check files for sensitivity.
 */
export function filterSensitiveFiles(paths: string[]): {
  safe: string[]
  warnings: { path: string; reason: string }[]
  dangers: { path: string; reason: string }[]
} {
  const safe: string[] = []
  const warnings: { path: string; reason: string }[] = []
  const dangers: { path: string; reason: string }[] = []

  for (const path of paths) {
    const result = checkSensitiveFile(path)
    switch (result.level) {
      case 'danger':
        dangers.push({ path, reason: result.reason })
        break
      case 'warning':
        warnings.push({ path, reason: result.reason })
        break
      default:
        safe.push(path)
    }
  }

  return { safe, warnings, dangers }
}
