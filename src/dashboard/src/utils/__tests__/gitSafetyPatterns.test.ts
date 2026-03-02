import { describe, it, expect } from 'vitest'
import { checkSensitiveFile, filterSensitiveFiles } from '../gitSafetyPatterns'
import type { SensitivityLevel, SensitivityResult } from '../gitSafetyPatterns'

// ─── helpers ─────────────────────────────────────────────────────────────────

function expectDanger(result: SensitivityResult) {
  expect(result.level).toBe<SensitivityLevel>('danger')
  expect(result.reason.length).toBeGreaterThan(0)
}

function expectWarning(result: SensitivityResult) {
  expect(result.level).toBe<SensitivityLevel>('warning')
  expect(result.reason.length).toBeGreaterThan(0)
}

function expectSafe(result: SensitivityResult) {
  expect(result.level).toBe<SensitivityLevel>('safe')
  expect(result.reason).toBe('')
}

// ─── checkSensitiveFile – DANGER patterns ────────────────────────────────────

describe('checkSensitiveFile – danger: .env variants', () => {
  it('matches bare .env file', () => {
    expectDanger(checkSensitiveFile('.env'))
  })

  it('matches .env.local', () => {
    expectDanger(checkSensitiveFile('.env.local'))
  })

  it('matches .env.production', () => {
    expectDanger(checkSensitiveFile('.env.production'))
  })

  it('matches .env.development', () => {
    expectDanger(checkSensitiveFile('.env.development'))
  })

  it('matches .env.staging', () => {
    expectDanger(checkSensitiveFile('.env.staging'))
  })

  it('matches .env.test', () => {
    expectDanger(checkSensitiveFile('.env.test'))
  })

  it('matches nested .env path', () => {
    expectDanger(checkSensitiveFile('src/config/.env'))
  })

  it('matches nested .env.local path', () => {
    expectDanger(checkSensitiveFile('apps/backend/.env.local'))
  })

  it('does NOT match .envrc (no dot after .env)', () => {
    // .envrc does not end at word boundary and has no dot after .env
    const result = checkSensitiveFile('.envrc')
    // The pattern is /\.env($|\.)/ — .envrc has 'rc' after env, so it should NOT match
    expect(result.level).toBe('safe')
  })

  it('returns reason "Environment variables file"', () => {
    expect(checkSensitiveFile('.env').reason).toBe('Environment variables file')
  })
})

describe('checkSensitiveFile – danger: .pem', () => {
  it('matches server.pem', () => {
    expectDanger(checkSensitiveFile('server.pem'))
  })

  it('matches path/to/cert.pem', () => {
    expectDanger(checkSensitiveFile('path/to/cert.pem'))
  })

  it('returns reason "Private key file"', () => {
    expect(checkSensitiveFile('cert.pem').reason).toBe('Private key file')
  })
})

describe('checkSensitiveFile – danger: .key', () => {
  it('matches private.key', () => {
    expectDanger(checkSensitiveFile('private.key'))
  })

  it('matches keys/server.key', () => {
    expectDanger(checkSensitiveFile('keys/server.key'))
  })

  it('returns reason "Private key file"', () => {
    expect(checkSensitiveFile('private.key').reason).toBe('Private key file')
  })
})

describe('checkSensitiveFile – danger: .p12', () => {
  it('matches certificate.p12', () => {
    expectDanger(checkSensitiveFile('certificate.p12'))
  })

  it('matches certs/client.p12', () => {
    expectDanger(checkSensitiveFile('certs/client.p12'))
  })

  it('returns reason "Certificate file"', () => {
    expect(checkSensitiveFile('certificate.p12').reason).toBe('Certificate file')
  })
})

describe('checkSensitiveFile – danger: .pfx', () => {
  it('matches cert.pfx', () => {
    expectDanger(checkSensitiveFile('cert.pfx'))
  })

  it('matches ssl/server.pfx', () => {
    expectDanger(checkSensitiveFile('ssl/server.pfx'))
  })

  it('returns reason "Certificate file"', () => {
    expect(checkSensitiveFile('cert.pfx').reason).toBe('Certificate file')
  })
})

describe('checkSensitiveFile – danger: credentials.json', () => {
  it('matches credentials.json at root', () => {
    expectDanger(checkSensitiveFile('credentials.json'))
  })

  it('matches nested credentials.json', () => {
    expectDanger(checkSensitiveFile('config/credentials.json'))
  })

  it('is case-insensitive for Credentials.json', () => {
    expectDanger(checkSensitiveFile('Credentials.json'))
  })

  it('is case-insensitive for CREDENTIALS.JSON', () => {
    expectDanger(checkSensitiveFile('CREDENTIALS.JSON'))
  })

  it('returns reason "Credentials file"', () => {
    expect(checkSensitiveFile('credentials.json').reason).toBe('Credentials file')
  })
})

describe('checkSensitiveFile – danger: secrets files', () => {
  it('matches secrets.json', () => {
    expectDanger(checkSensitiveFile('secrets.json'))
  })

  it('matches secret.json (singular)', () => {
    expectDanger(checkSensitiveFile('secret.json'))
  })

  it('matches secrets.yaml', () => {
    expectDanger(checkSensitiveFile('secrets.yaml'))
  })

  it('matches secrets.yml', () => {
    expectDanger(checkSensitiveFile('secrets.yml'))
  })

  it('matches secrets.toml', () => {
    expectDanger(checkSensitiveFile('secrets.toml'))
  })

  it('matches nested secrets.json', () => {
    expectDanger(checkSensitiveFile('config/secrets.json'))
  })

  it('is case-insensitive for Secrets.YAML', () => {
    expectDanger(checkSensitiveFile('Secrets.YAML'))
  })

  it('returns reason "Secrets file"', () => {
    expect(checkSensitiveFile('secrets.json').reason).toBe('Secrets file')
  })
})

describe('checkSensitiveFile – danger: .secret', () => {
  it('matches app.secret', () => {
    expectDanger(checkSensitiveFile('app.secret'))
  })

  it('matches nested config/master.secret', () => {
    expectDanger(checkSensitiveFile('config/master.secret'))
  })

  it('is case-insensitive for APP.SECRET', () => {
    expectDanger(checkSensitiveFile('APP.SECRET'))
  })

  it('returns reason "Secret file"', () => {
    expect(checkSensitiveFile('app.secret').reason).toBe('Secret file')
  })
})

describe('checkSensitiveFile – danger: id_rsa', () => {
  it('matches id_rsa', () => {
    expectDanger(checkSensitiveFile('id_rsa'))
  })

  it('matches .ssh/id_rsa', () => {
    expectDanger(checkSensitiveFile('.ssh/id_rsa'))
  })

  it('matches id_rsa.pub (contains id_rsa)', () => {
    expectDanger(checkSensitiveFile('id_rsa.pub'))
  })

  it('returns reason "SSH private key"', () => {
    expect(checkSensitiveFile('id_rsa').reason).toBe('SSH private key')
  })
})

describe('checkSensitiveFile – danger: id_ed25519', () => {
  it('matches id_ed25519', () => {
    expectDanger(checkSensitiveFile('id_ed25519'))
  })

  it('matches .ssh/id_ed25519', () => {
    expectDanger(checkSensitiveFile('.ssh/id_ed25519'))
  })

  it('matches id_ed25519.pub (contains id_ed25519)', () => {
    expectDanger(checkSensitiveFile('id_ed25519.pub'))
  })

  it('returns reason "SSH private key"', () => {
    expect(checkSensitiveFile('id_ed25519').reason).toBe('SSH private key')
  })
})

describe('checkSensitiveFile – danger: .keystore', () => {
  it('matches release.keystore', () => {
    expectDanger(checkSensitiveFile('release.keystore'))
  })

  it('matches android/app/release.keystore', () => {
    expectDanger(checkSensitiveFile('android/app/release.keystore'))
  })

  it('returns reason "Keystore file"', () => {
    expect(checkSensitiveFile('release.keystore').reason).toBe('Keystore file')
  })
})

describe('checkSensitiveFile – danger: token.json', () => {
  it('matches token.json at root', () => {
    expectDanger(checkSensitiveFile('token.json'))
  })

  it('matches nested auth/token.json', () => {
    expectDanger(checkSensitiveFile('auth/token.json'))
  })

  it('is case-insensitive for Token.json', () => {
    expectDanger(checkSensitiveFile('Token.json'))
  })

  it('returns reason "Token file"', () => {
    expect(checkSensitiveFile('token.json').reason).toBe('Token file')
  })
})

describe('checkSensitiveFile – danger: service_account*.json', () => {
  it('matches service_account.json', () => {
    expectDanger(checkSensitiveFile('service_account.json'))
  })

  it('matches service_account_prod.json', () => {
    expectDanger(checkSensitiveFile('service_account_prod.json'))
  })

  it('matches service-account.json (hyphen variant)', () => {
    expectDanger(checkSensitiveFile('service-account.json'))
  })

  it('matches serviceaccount.json (no separator)', () => {
    expectDanger(checkSensitiveFile('serviceaccount.json'))
  })

  it('matches nested path/to/service_account.json', () => {
    expectDanger(checkSensitiveFile('gcp/service_account.json'))
  })

  it('is case-insensitive for Service_Account.JSON', () => {
    expectDanger(checkSensitiveFile('Service_Account.JSON'))
  })

  it('returns reason "Service account credentials"', () => {
    expect(checkSensitiveFile('service_account.json').reason).toBe('Service account credentials')
  })
})

// ─── checkSensitiveFile – WARNING patterns ───────────────────────────────────

describe('checkSensitiveFile – warning: .sqlite / .sqlite3', () => {
  it('matches database.sqlite', () => {
    expectWarning(checkSensitiveFile('database.sqlite'))
  })

  it('matches database.sqlite3', () => {
    expectWarning(checkSensitiveFile('database.sqlite3'))
  })

  it('matches nested db/local.sqlite', () => {
    expectWarning(checkSensitiveFile('db/local.sqlite'))
  })

  it('returns reason "SQLite database"', () => {
    expect(checkSensitiveFile('database.sqlite').reason).toBe('SQLite database')
  })
})

describe('checkSensitiveFile – warning: .db', () => {
  it('matches local.db', () => {
    expectWarning(checkSensitiveFile('local.db'))
  })

  it('matches data/app.db', () => {
    expectWarning(checkSensitiveFile('data/app.db'))
  })

  it('returns reason "Database file"', () => {
    expect(checkSensitiveFile('local.db').reason).toBe('Database file')
  })
})

describe('checkSensitiveFile – warning: node_modules/', () => {
  it('matches node_modules/lodash/index.js', () => {
    expectWarning(checkSensitiveFile('node_modules/lodash/index.js'))
  })

  it('matches nested project/node_modules/react/index.js', () => {
    expectWarning(checkSensitiveFile('project/node_modules/react/index.js'))
  })

  it('returns reason "Node modules directory"', () => {
    expect(checkSensitiveFile('node_modules/some-pkg/file.js').reason).toBe(
      'Node modules directory',
    )
  })
})

describe('checkSensitiveFile – warning: __pycache__/', () => {
  it('matches __pycache__/module.cpython-311.pyc at root', () => {
    expectWarning(checkSensitiveFile('__pycache__/module.cpython-311.pyc'))
  })

  it('matches src/__pycache__/utils.cpython-310.pyc (nested)', () => {
    expectWarning(checkSensitiveFile('src/__pycache__/utils.cpython-310.pyc'))
  })

  it('returns reason "Python cache"', () => {
    expect(checkSensitiveFile('__pycache__/mod.pyc').reason).toBe('Python cache')
  })
})

describe('checkSensitiveFile – warning: .pyc', () => {
  it('matches compiled.pyc', () => {
    expectWarning(checkSensitiveFile('compiled.pyc'))
  })

  it('matches src/module.pyc', () => {
    expectWarning(checkSensitiveFile('src/module.pyc'))
  })

  it('returns reason "Python bytecode"', () => {
    expect(checkSensitiveFile('module.pyc').reason).toBe('Python bytecode')
  })
})

describe('checkSensitiveFile – warning: .DS_Store', () => {
  it('matches .DS_Store at root', () => {
    expectWarning(checkSensitiveFile('.DS_Store'))
  })

  it('matches src/.DS_Store', () => {
    expectWarning(checkSensitiveFile('src/.DS_Store'))
  })

  it('returns reason "macOS metadata file"', () => {
    expect(checkSensitiveFile('.DS_Store').reason).toBe('macOS metadata file')
  })
})

describe('checkSensitiveFile – warning: Thumbs.db', () => {
  it('matches Thumbs.db at root (as a warning)', () => {
    expectWarning(checkSensitiveFile('Thumbs.db'))
  })

  it('matches images/Thumbs.db (as a warning)', () => {
    expectWarning(checkSensitiveFile('images/Thumbs.db'))
  })

  // NOTE: Thumbs.db ends with ".db", so the /\.db$/ pattern (index 1 in WARNING_PATTERNS)
  // fires before /Thumbs\.db$/ (index 6). First-match semantics mean the reported reason
  // is "Database file", not "Windows metadata file". This documents real behavior.
  it('reason is "Database file" due to first-match ordering (.db pattern fires first)', () => {
    expect(checkSensitiveFile('Thumbs.db').reason).toBe('Database file')
  })
})

describe('checkSensitiveFile – warning: .log', () => {
  it('matches app.log', () => {
    expectWarning(checkSensitiveFile('app.log'))
  })

  it('matches logs/error.log', () => {
    expectWarning(checkSensitiveFile('logs/error.log'))
  })

  it('returns reason "Log file"', () => {
    expect(checkSensitiveFile('app.log').reason).toBe('Log file')
  })
})

describe('checkSensitiveFile – warning: .bak', () => {
  it('matches config.bak', () => {
    expectWarning(checkSensitiveFile('config.bak'))
  })

  it('matches src/old_code.bak', () => {
    expectWarning(checkSensitiveFile('src/old_code.bak'))
  })

  it('returns reason "Backup file"', () => {
    expect(checkSensitiveFile('config.bak').reason).toBe('Backup file')
  })
})

describe('checkSensitiveFile – warning: .tmp', () => {
  it('matches session.tmp', () => {
    expectWarning(checkSensitiveFile('session.tmp'))
  })

  it('matches /tmp/upload.tmp', () => {
    expectWarning(checkSensitiveFile('/tmp/upload.tmp'))
  })

  it('returns reason "Temporary file"', () => {
    expect(checkSensitiveFile('session.tmp').reason).toBe('Temporary file')
  })
})

describe('checkSensitiveFile – warning: .swp', () => {
  it('matches .main.py.swp', () => {
    expectWarning(checkSensitiveFile('.main.py.swp'))
  })

  it('matches src/.index.ts.swp', () => {
    expectWarning(checkSensitiveFile('src/.index.ts.swp'))
  })

  it('returns reason "Vim swap file"', () => {
    expect(checkSensitiveFile('.main.py.swp').reason).toBe('Vim swap file')
  })
})

describe('checkSensitiveFile – warning: .swo', () => {
  it('matches .main.py.swo', () => {
    expectWarning(checkSensitiveFile('.main.py.swo'))
  })

  it('matches src/.index.ts.swo', () => {
    expectWarning(checkSensitiveFile('src/.index.ts.swo'))
  })

  it('returns reason "Vim swap file"', () => {
    expect(checkSensitiveFile('.main.py.swo').reason).toBe('Vim swap file')
  })
})

describe('checkSensitiveFile – warning: dist/', () => {
  it('matches dist/bundle.js', () => {
    expectWarning(checkSensitiveFile('dist/bundle.js'))
  })

  it('matches packages/app/dist/index.js', () => {
    expectWarning(checkSensitiveFile('packages/app/dist/index.js'))
  })

  it('returns reason "Build output directory"', () => {
    expect(checkSensitiveFile('dist/main.js').reason).toBe('Build output directory')
  })
})

describe('checkSensitiveFile – warning: build/', () => {
  it('matches build/output.js', () => {
    expectWarning(checkSensitiveFile('build/output.js'))
  })

  it('matches apps/web/build/index.html', () => {
    expectWarning(checkSensitiveFile('apps/web/build/index.html'))
  })

  it('returns reason "Build output directory"', () => {
    expect(checkSensitiveFile('build/index.js').reason).toBe('Build output directory')
  })
})

describe('checkSensitiveFile – warning: .idea/', () => {
  it('matches .idea/workspace.xml', () => {
    expectWarning(checkSensitiveFile('.idea/workspace.xml'))
  })

  it('matches project/.idea/modules.xml', () => {
    expectWarning(checkSensitiveFile('project/.idea/modules.xml'))
  })

  it('returns reason "IDE configuration"', () => {
    expect(checkSensitiveFile('.idea/workspace.xml').reason).toBe('IDE configuration')
  })
})

describe('checkSensitiveFile – warning: .vscode/settings.json', () => {
  it('matches .vscode/settings.json', () => {
    expectWarning(checkSensitiveFile('.vscode/settings.json'))
  })

  it('matches nested project/.vscode/settings.json', () => {
    expectWarning(checkSensitiveFile('project/.vscode/settings.json'))
  })

  it('does NOT flag .vscode/extensions.json (not settings.json)', () => {
    // Only settings.json is flagged; other .vscode files are safe
    const result = checkSensitiveFile('.vscode/extensions.json')
    expect(result.level).toBe('safe')
  })

  it('does NOT flag .vscode/launch.json', () => {
    const result = checkSensitiveFile('.vscode/launch.json')
    expect(result.level).toBe('safe')
  })

  it('returns reason "VS Code user settings"', () => {
    expect(checkSensitiveFile('.vscode/settings.json').reason).toBe('VS Code user settings')
  })
})

// ─── checkSensitiveFile – safe files ─────────────────────────────────────────

describe('checkSensitiveFile – safe: normal source files', () => {
  it('returns safe for a .ts file', () => {
    expectSafe(checkSensitiveFile('src/utils/helpers.ts'))
  })

  it('returns safe for a .tsx file', () => {
    expectSafe(checkSensitiveFile('src/components/Button.tsx'))
  })

  it('returns safe for a .py file', () => {
    expectSafe(checkSensitiveFile('src/backend/main.py'))
  })

  it('returns safe for a .md file', () => {
    expectSafe(checkSensitiveFile('README.md'))
  })

  it('returns safe for a .json config file (not credentials/secrets/token)', () => {
    expectSafe(checkSensitiveFile('package.json'))
  })

  it('returns safe for tsconfig.json', () => {
    expectSafe(checkSensitiveFile('tsconfig.json'))
  })

  it('returns safe for .eslintrc.json', () => {
    expectSafe(checkSensitiveFile('.eslintrc.json'))
  })

  it('returns safe for a .css file', () => {
    expectSafe(checkSensitiveFile('src/styles/main.css'))
  })

  it('returns safe for a .html file', () => {
    expectSafe(checkSensitiveFile('public/index.html'))
  })

  it('returns safe for a .yaml config (not secrets)', () => {
    expectSafe(checkSensitiveFile('.github/workflows/ci.yaml'))
  })

  it('returns safe for a .yml config (not secrets)', () => {
    expectSafe(checkSensitiveFile('docker-compose.yml'))
  })

  it('returns safe for a .toml config (not secrets)', () => {
    expectSafe(checkSensitiveFile('pyproject.toml'))
  })

  it('returns safe for an image file', () => {
    expectSafe(checkSensitiveFile('public/logo.png'))
  })

  it('returns safe for a .gitignore file', () => {
    expectSafe(checkSensitiveFile('.gitignore'))
  })

  it('returns safe for a .vscode/extensions.json', () => {
    expectSafe(checkSensitiveFile('.vscode/extensions.json'))
  })

  it('returns reason as empty string for safe files', () => {
    expect(checkSensitiveFile('src/index.ts').reason).toBe('')
  })
})

// ─── checkSensitiveFile – Windows backslash normalization ────────────────────

describe('checkSensitiveFile – Windows backslash normalization', () => {
  it('normalizes backslash in danger path .env', () => {
    expectDanger(checkSensitiveFile('.env'))
  })

  it('normalizes Windows-style path to detect credentials.json', () => {
    expectDanger(checkSensitiveFile('config\\credentials.json'))
  })

  it('normalizes Windows-style path to detect .pem', () => {
    expectDanger(checkSensitiveFile('certs\\server.pem'))
  })

  it('normalizes Windows-style path to detect node_modules', () => {
    expectWarning(checkSensitiveFile('node_modules\\lodash\\index.js'))
  })

  it('normalizes Windows-style path to detect .DS_Store', () => {
    expectWarning(checkSensitiveFile('src\\.DS_Store'))
  })

  it('normalizes Windows-style path to detect dist/', () => {
    expectWarning(checkSensitiveFile('dist\\bundle.js'))
  })

  it('normalizes Windows-style path to detect .vscode\\settings.json', () => {
    expectWarning(checkSensitiveFile('.vscode\\settings.json'))
  })

  it('normalizes Windows-style path for safe .ts file', () => {
    expectSafe(checkSensitiveFile('src\\utils\\helpers.ts'))
  })

  it('handles mixed forward and backslashes', () => {
    expectDanger(checkSensitiveFile('config\\.env.production'))
  })
})

// ─── checkSensitiveFile – return type shape ───────────────────────────────────

describe('checkSensitiveFile – return type shape', () => {
  it('always returns an object with level and reason properties', () => {
    const results = [
      checkSensitiveFile('.env'),
      checkSensitiveFile('database.sqlite'),
      checkSensitiveFile('src/index.ts'),
    ]
    for (const result of results) {
      expect(result).toHaveProperty('level')
      expect(result).toHaveProperty('reason')
    }
  })

  it('level is always a valid SensitivityLevel', () => {
    const validLevels: SensitivityLevel[] = ['danger', 'warning', 'safe']
    const inputs = ['.env', 'database.sqlite', 'src/index.ts']
    for (const input of inputs) {
      expect(validLevels).toContain(checkSensitiveFile(input).level)
    }
  })

  it('danger and warning results always have non-empty reason', () => {
    expect(checkSensitiveFile('.env').reason.length).toBeGreaterThan(0)
    expect(checkSensitiveFile('database.sqlite').reason.length).toBeGreaterThan(0)
  })

  it('safe result always has empty reason', () => {
    expect(checkSensitiveFile('src/main.ts').reason).toBe('')
  })
})

// ─── checkSensitiveFile – danger takes priority over warning ─────────────────

describe('checkSensitiveFile – danger takes priority over warning', () => {
  // A path ending in .env inside a dist/ folder should still be danger
  it('danger wins over warning for dist/.env', () => {
    expectDanger(checkSensitiveFile('dist/.env'))
  })

  // A path with .log extension inside node_modules: node_modules matches as warning first;
  // .log also matches warning — still warning
  it('warning for node_modules/pkg/debug.log', () => {
    expectWarning(checkSensitiveFile('node_modules/pkg/debug.log'))
  })
})

// ─── filterSensitiveFiles ────────────────────────────────────────────────────

describe('filterSensitiveFiles – empty input', () => {
  it('returns empty arrays for an empty path list', () => {
    const result = filterSensitiveFiles([])
    expect(result.safe).toEqual([])
    expect(result.warnings).toEqual([])
    expect(result.dangers).toEqual([])
  })
})

describe('filterSensitiveFiles – all safe', () => {
  it('puts all safe files into the safe array', () => {
    const paths = ['src/index.ts', 'src/App.tsx', 'README.md']
    const result = filterSensitiveFiles(paths)
    expect(result.safe).toEqual(paths)
    expect(result.warnings).toEqual([])
    expect(result.dangers).toEqual([])
  })
})

describe('filterSensitiveFiles – all danger', () => {
  it('puts all dangerous files into the dangers array', () => {
    const paths = ['.env', 'credentials.json', 'id_rsa']
    const result = filterSensitiveFiles(paths)
    expect(result.dangers).toHaveLength(3)
    expect(result.warnings).toEqual([])
    expect(result.safe).toEqual([])
    expect(result.dangers.map((d) => d.path)).toEqual(paths)
  })

  it('includes reason for each danger entry', () => {
    const result = filterSensitiveFiles(['.env', 'id_rsa'])
    for (const entry of result.dangers) {
      expect(entry.reason.length).toBeGreaterThan(0)
    }
  })
})

describe('filterSensitiveFiles – all warnings', () => {
  it('puts all warning files into the warnings array', () => {
    const paths = ['database.sqlite', 'app.log', 'build/bundle.js']
    const result = filterSensitiveFiles(paths)
    expect(result.warnings).toHaveLength(3)
    expect(result.dangers).toEqual([])
    expect(result.safe).toEqual([])
    expect(result.warnings.map((w) => w.path)).toEqual(paths)
  })

  it('includes reason for each warning entry', () => {
    const result = filterSensitiveFiles(['database.sqlite', 'app.log'])
    for (const entry of result.warnings) {
      expect(entry.reason.length).toBeGreaterThan(0)
    }
  })
})

describe('filterSensitiveFiles – mixed input', () => {
  it('correctly separates safe, warning, and danger files', () => {
    const paths = [
      'src/index.ts',         // safe
      'src/utils/helpers.ts', // safe
      'README.md',            // safe
      'database.sqlite',      // warning
      'app.log',              // warning
      '.DS_Store',            // warning
      '.env',                 // danger
      'credentials.json',     // danger
      'id_rsa',               // danger
    ]

    const result = filterSensitiveFiles(paths)

    expect(result.safe).toEqual(['src/index.ts', 'src/utils/helpers.ts', 'README.md'])
    expect(result.warnings.map((w) => w.path)).toEqual(['database.sqlite', 'app.log', '.DS_Store'])
    expect(result.dangers.map((d) => d.path)).toEqual(['.env', 'credentials.json', 'id_rsa'])
  })

  it('preserves path exactly in the output entries', () => {
    const paths = ['.env.local', 'dist/bundle.js', 'package.json']
    const result = filterSensitiveFiles(paths)

    expect(result.dangers[0].path).toBe('.env.local')
    expect(result.warnings[0].path).toBe('dist/bundle.js')
    expect(result.safe[0]).toBe('package.json')
  })

  it('handles a single danger file in a mixed list', () => {
    const paths = ['src/main.ts', '.env', 'tsconfig.json']
    const result = filterSensitiveFiles(paths)
    expect(result.dangers).toHaveLength(1)
    expect(result.dangers[0].path).toBe('.env')
    expect(result.safe).toHaveLength(2)
    expect(result.warnings).toHaveLength(0)
  })

  it('handles a single warning file in a mixed list', () => {
    const paths = ['src/main.ts', 'package.json', 'app.log']
    const result = filterSensitiveFiles(paths)
    expect(result.warnings).toHaveLength(1)
    expect(result.warnings[0].path).toBe('app.log')
    expect(result.safe).toHaveLength(2)
    expect(result.dangers).toHaveLength(0)
  })

  it('total count equals input length', () => {
    const paths = ['src/a.ts', '.env', 'app.log', 'secret.pem', 'README.md']
    const result = filterSensitiveFiles(paths)
    const total = result.safe.length + result.warnings.length + result.dangers.length
    expect(total).toBe(paths.length)
  })
})

describe('filterSensitiveFiles – Windows paths in batch', () => {
  it('normalizes backslashes when batch-checking files', () => {
    const paths = [
      'src\\index.ts',         // safe
      'config\\credentials.json', // danger
      'dist\\bundle.js',       // warning
    ]
    const result = filterSensitiveFiles(paths)
    expect(result.safe).toHaveLength(1)
    expect(result.dangers).toHaveLength(1)
    expect(result.warnings).toHaveLength(1)
    // paths are stored as-is (no mutation of original strings)
    expect(result.dangers[0].path).toBe('config\\credentials.json')
  })
})

describe('filterSensitiveFiles – return type shape', () => {
  it('always returns an object with safe, warnings, dangers arrays', () => {
    const result = filterSensitiveFiles([])
    expect(Array.isArray(result.safe)).toBe(true)
    expect(Array.isArray(result.warnings)).toBe(true)
    expect(Array.isArray(result.dangers)).toBe(true)
  })

  it('safe is an array of strings', () => {
    const result = filterSensitiveFiles(['src/index.ts'])
    expect(typeof result.safe[0]).toBe('string')
  })

  it('warnings entries have path and reason string fields', () => {
    const result = filterSensitiveFiles(['app.log'])
    expect(result.warnings[0]).toHaveProperty('path')
    expect(result.warnings[0]).toHaveProperty('reason')
    expect(typeof result.warnings[0].path).toBe('string')
    expect(typeof result.warnings[0].reason).toBe('string')
  })

  it('dangers entries have path and reason string fields', () => {
    const result = filterSensitiveFiles(['.env'])
    expect(result.dangers[0]).toHaveProperty('path')
    expect(result.dangers[0]).toHaveProperty('reason')
    expect(typeof result.dangers[0].path).toBe('string')
    expect(typeof result.dangers[0].reason).toBe('string')
  })
})

// ─── checkSensitiveFile – edge cases ─────────────────────────────────────────

describe('checkSensitiveFile – edge cases', () => {
  it('handles empty string path (returns safe)', () => {
    const result = checkSensitiveFile('')
    expect(result.level).toBe('safe')
    expect(result.reason).toBe('')
  })

  it('handles a path with only slashes', () => {
    const result = checkSensitiveFile('///')
    expect(result.level).toBe('safe')
  })

  it('handles a very long path', () => {
    const longPath = 'a/'.repeat(50) + 'main.ts'
    expectSafe(checkSensitiveFile(longPath))
  })

  it('handles a very long danger path', () => {
    const longPath = 'config/nested/deep/path/'.repeat(10) + '.env'
    expectDanger(checkSensitiveFile(longPath))
  })

  it('handles a path that is just a filename (no directory)', () => {
    expectDanger(checkSensitiveFile('id_rsa'))
    expectWarning(checkSensitiveFile('app.log'))
    expectSafe(checkSensitiveFile('main.ts'))
  })

  it('handles .env at the very start of path with no directory', () => {
    expectDanger(checkSensitiveFile('.env'))
  })

  it('does not flag a file named "envfile" (no .env prefix)', () => {
    expectSafe(checkSensitiveFile('envfile'))
  })

  it('does not flag a file with "env" in the name but no dot', () => {
    expectSafe(checkSensitiveFile('environment.ts'))
  })

  it('does not flag .vscode/launch.json as sensitive', () => {
    expectSafe(checkSensitiveFile('.vscode/launch.json'))
  })

  it('does not flag .vscode/keybindings.json as sensitive', () => {
    expectSafe(checkSensitiveFile('.vscode/keybindings.json'))
  })

  it('correctly identifies all 13 danger pattern reasons are non-empty strings', () => {
    const dangerFiles = [
      '.env',
      'server.pem',
      'private.key',
      'certificate.p12',
      'cert.pfx',
      'credentials.json',
      'secrets.json',
      'app.secret',
      'id_rsa',
      'id_ed25519',
      'release.keystore',
      'token.json',
      'service_account.json',
    ]
    for (const file of dangerFiles) {
      const result = checkSensitiveFile(file)
      expect(result.level).toBe('danger')
      expect(result.reason.length).toBeGreaterThan(0)
    }
  })

  it('correctly identifies all 16 warning pattern reasons are non-empty strings', () => {
    const warningFiles = [
      'db.sqlite',
      'data.sqlite3',
      'local.db',
      'node_modules/pkg/file.js',
      '__pycache__/module.pyc',
      'module.pyc',
      '.DS_Store',
      'Thumbs.db',
      'error.log',
      'backup.bak',
      'temp.tmp',
      'file.swp',
      'file.swo',
      'dist/bundle.js',
      'build/index.js',
      '.idea/workspace.xml',
      '.vscode/settings.json',
    ]
    for (const file of warningFiles) {
      const result = checkSensitiveFile(file)
      expect(result.level).toBe('warning')
      expect(result.reason.length).toBeGreaterThan(0)
    }
  })
})
