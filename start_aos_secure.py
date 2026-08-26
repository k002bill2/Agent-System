import os
from pathlib import Path

env_file = Path('/Users/younghwankang/Work/Agent-System/.env')
for line in env_file.read_text().splitlines():
    s = line.strip()
    if s and not s.startswith('#') and '=' in s:
        key, value = s.split('=', 1)
        os.environ[key] = value
os.environ['HOST'] = '127.0.0.1'
os.environ['PORT'] = '8000'
os.execv(
    '/Users/younghwankang/Work/Agent-System/src/backend/.venv/bin/uvicorn',
    [
        'uvicorn', 'api.app:app',
        '--host', '127.0.0.1', '--port', '8000', '--reload',
        '--reload-exclude', '.claude/*', '--reload-exclude', '.temp/*',
        '--reload-exclude', '*.json', '--reload-exclude', 'logs/*',
        '--reload-exclude', 'node_modules/*',
    ],
)
