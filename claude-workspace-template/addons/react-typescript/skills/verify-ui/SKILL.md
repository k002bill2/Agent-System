---
name: verify-ui
description: Verify UI consistency including Tailwind class patterns, dark mode support, responsive layouts, and icon usage.
---

# UI Consistency Verification

## Purpose

1. Verify that Tailwind CSS classes use consistent patterns
2. Verify that all components support dark mode
3. Verify that colors, spacing, and font sizes follow design tokens
4. Verify that icon libraries are unified

## When to Run

- After adding new UI components
- After changing styling
- After dark mode related work
- After modifying design tokens

## Related Files

| File | Purpose |
|------|---------|
| `src/**/components/**/*.tsx` | UI components |
| `src/**/pages/**/*.tsx` | Page layouts |
| `tailwind.config.js` | Tailwind configuration |
| `src/**/index.css` | Global styles |

## Workflow

### Step 1: Dark Mode Support Check

Verify components using background/text colors have `dark:` variant:

```bash
# bg-white used without dark: variant
grep -rn "bg-white\|bg-gray-50\|bg-gray-100" src/ --include="*.tsx" | grep -v "dark:"

# text-gray-900 used without dark: variant
grep -rn "text-gray-900\|text-gray-800\|text-black" src/ --include="*.tsx" | grep -v "dark:"

# border color without dark: variant
grep -rn "border-gray-200\|border-gray-300" src/ --include="*.tsx" | grep -v "dark:"
```

**PASS criteria**: Light background/text/border colors have corresponding `dark:` classes
**FAIL criteria**: Components using light colors only without `dark:` variant

### Step 2: Color Consistency Check

Verify primary colors used across the project:

```bash
# Primary color patterns
grep -rn "primary-\|blue-\|indigo-" src/ --include="*.tsx" | grep "bg-\|text-\|border-" | head -20

# Direct hex/rgb color usage
grep -rn "#[0-9a-fA-F]\{3,6\}\|rgb(" src/ --include="*.tsx" | grep -v "node_modules"
```

**PASS criteria**: Only Tailwind utility classes used, no direct color values
**FAIL criteria**: Inline hex/rgb colors used

### Step 3: Spacing Consistency Check

Detect inconsistent spacing usage:

```bash
# Non-standard padding/margin values
grep -rn "p-\[.*px\]\|m-\[.*px\]\|gap-\[.*px\]" src/ --include="*.tsx"
```

**PASS criteria**: Standard Tailwind spacing scale used (p-2, p-4, p-6, etc.)
**FAIL criteria**: Arbitrary px values for spacing (p-[13px], etc.)

### Step 4: Icon Library Consistency Check

```bash
# Check which icon libraries are in use
grep -rn "from 'lucide-react'\|from 'react-icons'\|from '@heroicons'" src/ --include="*.tsx" | head -5

# Check for mixed library usage
grep -rn "import.*from.*icons\|import.*Icon" src/ --include="*.tsx" | grep -oP "from '[^']+'" | sort -u
```

**PASS criteria**: Single icon library used (e.g., lucide-react)
**FAIL criteria**: Multiple icon libraries mixed

### Step 5: Responsive Layout Check

Verify main layouts use responsive classes:

```bash
# Responsive class usage patterns
grep -rn "sm:\|md:\|lg:\|xl:" src/ --include="*.tsx" | head -20

# Grid/flex layouts without responsive breakpoints
grep -rn "grid-cols-\|flex.*wrap" src/ --include="*.tsx" | grep -v "sm:\|md:\|lg:"
```

**PASS criteria**: Main grid layouts have responsive breakpoints applied
**FAIL criteria**: Fixed column counts only (no responsive support)

### Step 6: Summary

## Output Format

```markdown
## UI Consistency Verification Results

| Check | Violations | Severity | Status |
|-------|-----------|----------|--------|
| Dark Mode | N | Medium | PASS/FAIL |
| Color Consistency | N | Low | PASS/WARN |
| Spacing Consistency | N | Low | PASS/WARN |
| Icon Consistency | N libraries | Medium | PASS/FAIL |
| Responsive | N | Low | PASS/WARN |

### Components Missing Dark Mode

| File:Line | Class | Missing dark: |
|-----------|-------|---------------|
| Card.tsx:15 | bg-white | dark:bg-gray-800 |
```

## Exceptions

1. **SVG/Image colors**: Colors inside SVG files or images are outside Tailwind scope
2. **Third-party components**: External library component styles cannot be controlled
3. **Print styles**: Print-specific styles do not need dark mode
4. **Admin pages**: Admin-only pages have lower responsive priority (WARN)
5. **Animation colors**: Colors in `animate-*` classes are exempt from token checks
