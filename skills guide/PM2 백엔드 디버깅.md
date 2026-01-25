# PM2와 백엔드 디버깅 시스템
#claude-code #pm2 #debugging #backend

> 💡 **문제**: 7개 마이크로서비스 동시 실행, Claude가 로그 못 봄
> 
> ✅ **해결**: PM2로 프로세스 관리 + 실시간 로그 접근

## 🎯 왜 PM2인가?

### Before PM2
```bash
Me: "이메일 서비스 에러 나는데"
Me: [수동으로 로그 찾기]
Me: [복사해서 붙여넣기]
Claude: "분석해보니..."
```

### After PM2
```bash
Me: "이메일 서비스 에러 나는데"
Claude: pm2 logs email --lines 200
Claude: "타임아웃 에러네요. 재시작하겠습니다"
Claude: pm2 restart email
Claude: "해결되었습니다"
```

## 📦 PM2 설치 및 설정

### Step 1: 설치
```bash
npm install -g pm2
# 또는
pnpm add -g pm2
```

### Step 2: ecosystem.config.js 생성
```javascript
module.exports = {
  apps: [
    {
      name: 'api-gateway',
      script: 'npm',
      args: 'start',
      cwd: './api-gateway',
      error_file: './api-gateway/logs/error.log',
      out_file: './api-gateway/logs/out.log',
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'development',
        PORT: 3000
      }
    },
    {
      name: 'auth-service',
      script: 'npm',
      args: 'start',
      cwd: './auth',
      error_file: './auth/logs/error.log',
      out_file: './auth/logs/out.log',
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'development',
        PORT: 3001
      }
    },
    {
      name: 'email-service',
      script: 'npm',
      args: 'start',
      cwd: './email',
      error_file: './email/logs/error.log',
      out_file: './email/logs/out.log',
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'development',
        PORT: 3002,
        SMTP_HOST: 'smtp.gmail.com'
      }
    },
    {
      name: 'notification-service',
      script: 'npm',
      args: 'start',
      cwd: './notification',
      error_file: './notification/logs/error.log',
      out_file: './notification/logs/out.log',
      merge_logs: true,
      time: true,
      instances: 2,  // 클러스터 모드
      exec_mode: 'cluster',
      env: {
        NODE_ENV: 'development',
        PORT: 3003
      }
    },
    {
      name: 'database-service',
      script: 'npm',
      args: 'start',
      cwd: './database',
      error_file: './database/logs/error.log',
      out_file: './database/logs/out.log',
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: 'development',
        PORT: 3004,
        DATABASE_URL: process.env.DATABASE_URL
      }
    },
    {
      name: 'worker-service',
      script: 'npm',
      args: 'start',
      cwd: './worker',
      error_file: './worker/logs/error.log',
      out_file: './worker/logs/out.log',
      merge_logs: true,
      time: true,
      max_restarts: 10,
      min_uptime: '10s',
      env: {
        NODE_ENV: 'development',
        PORT: 3005
      }
    },
    {
      name: 'scheduler',
      script: 'npm',
      args: 'start',
      cwd: './scheduler',
      error_file: './scheduler/logs/error.log',
      out_file: './scheduler/logs/out.log',
      merge_logs: true,
      time: true,
      cron_restart: '0 0 * * *',  // 매일 자정 재시작
      env: {
        NODE_ENV: 'development',
        PORT: 3006
      }
    }
  ]
};
```

### Step 3: package.json 스크립트 추가
```json
{
  "scripts": {
    "pm2:start": "pm2 start ecosystem.config.js",
    "pm2:stop": "pm2 stop all",
    "pm2:restart": "pm2 restart all",
    "pm2:delete": "pm2 delete all",
    "pm2:logs": "pm2 logs",
    "pm2:monitor": "pm2 monit",
    "pm2:status": "pm2 list",
    "pm2:save": "pm2 save",
    "pm2:startup": "pm2 startup"
  }
}
```

## 🎮 PM2 명령어

### 기본 명령어
```bash
# 시작
pm2 start ecosystem.config.js
pnpm pm2:start

# 상태 확인
pm2 list
pm2 status

# 로그 보기
pm2 logs                    # 모든 서비스
pm2 logs email             # 특정 서비스
pm2 logs email --lines 100 # 최근 100줄
pm2 logs --err             # 에러 로그만

# 재시작
pm2 restart all            # 모두
pm2 restart email          # 특정 서비스
pm2 restart 0              # ID로 재시작

# 중지
pm2 stop all
pm2 stop email

# 삭제
pm2 delete all
pm2 delete email
```

### 모니터링
```bash
# 실시간 모니터링
pm2 monit

# 상세 정보
pm2 show email

# 메모리/CPU 사용량
pm2 list

# 웹 대시보드 (pm2.io 계정 필요)
pm2 web
```

## 🔧 Claude와 함께 사용하기

### CLAUDE.md에 추가
```markdown
## Backend Services

All backend services are managed by PM2:

### Starting Services
\`\`\`bash
pnpm pm2:start  # Start all services
\`\`\`

### Debugging
\`\`\`bash
# Check service status
pm2 list

# View logs for specific service
pm2 logs [service-name] --lines 200

# Restart problematic service
pm2 restart [service-name]
\`\`\`

### Available Services
- api-gateway (port 3000)
- auth-service (port 3001)
- email-service (port 3002)
- notification-service (port 3003)
- database-service (port 3004)
- worker-service (port 3005)
- scheduler (port 3006)
```

### Claude 프롬프트 예시
```bash
"The email service is returning 500 errors. 
Check the logs and debug the issue."

# Claude 실행:
# pm2 logs email --lines 200
# pm2 show email
# pm2 restart email
```

## 📊 고급 설정

### 1. 클러스터 모드
```javascript
{
  name: 'api-server',
  script: './server.js',
  instances: 'max',     // CPU 코어 수만큼
  exec_mode: 'cluster', // 클러스터 모드
  wait_ready: true,
  listen_timeout: 3000
}
```

### 2. 자동 재시작
```javascript
{
  name: 'unstable-service',
  script: './service.js',
  max_restarts: 10,        // 최대 재시작 횟수
  min_uptime: '10s',       // 최소 실행 시간
  max_memory_restart: '500M', // 메모리 제한
  autorestart: true
}
```

### 3. 환경별 설정
```javascript
{
  name: 'api',
  script: './app.js',
  env: {
    NODE_ENV: 'development',
    PORT: 3000
  },
  env_production: {
    NODE_ENV: 'production',
    PORT: 80
  },
  env_staging: {
    NODE_ENV: 'staging',
    PORT: 3000
  }
}
```

### 4. Cron 재시작
```javascript
{
  name: 'cleanup-job',
  script: './cleanup.js',
  cron_restart: '0 2 * * *', // 매일 새벽 2시
  autorestart: false
}
```

## 🪝 PM2 + Hooks 연동

### 서비스 상태 체크 Hook
```typescript
// .claude/hooks/serviceHealthCheck.ts
export async function onStopEvent(context: any) {
  const { exec } = require('child_process');
  
  exec('pm2 jlist', (error, stdout) => {
    if (error) return;
    
    const services = JSON.parse(stdout);
    const problems = services.filter(s => 
      s.pm2_env.status !== 'online' || 
      s.pm2_env.restart_time > 5
    );
    
    if (problems.length > 0) {
      console.log(`
⚠️ SERVICE ISSUES DETECTED
${problems.map(s => `
- ${s.name}: ${s.pm2_env.status} (${s.pm2_env.restart_time} restarts)
`).join('')}

Consider investigating these services.
      `);
    }
  });
}
```

## 📝 로그 관리

### 로그 로테이션 설정
```bash
# PM2 로그 로테이션 설치
pm2 install pm2-logrotate

# 설정
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
```

### 구조화된 로깅
```javascript
// 서비스 내 로깅
const winston = require('winston');

const logger = winston.createLogger({
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ 
      filename: 'logs/app.log' 
    })
  ]
});

// PM2가 이 로그를 캡처
logger.info('Service started', { 
  service: 'email', 
  port: 3002 
});
```

## 🚨 문제 해결

### 일반적인 문제들

#### 1. 서비스가 계속 재시작
```bash
# 로그 확인
pm2 logs [service-name] --err

# 시작 시간 증가
pm2 start app.js --wait-ready --listen-timeout 5000
```

#### 2. 메모리 누수
```bash
# 메모리 제한 설정
pm2 start app.js --max-memory-restart 300M

# 메모리 사용량 모니터링
pm2 monit
```

#### 3. 포트 충돌
```javascript
// ecosystem.config.js에서 포트 명확히 지정
env: {
  PORT: 3001,  // 각 서비스별 고유 포트
  NODE_ENV: 'development'
}
```

## 💡 Pro Tips

### 1. Development vs Production
```bash
# 개발 환경 (watch 모드)
pm2 start app.js --watch --ignore-watch="node_modules"

# 프로덕션 (클러스터 모드)
pm2 start app.js -i max --env production
```

### 2. 시작 순서 의존성
```javascript
// 순차적 시작
{
  apps: [
    {
      name: 'database',
      script: './db.js',
      wait_ready: true,
      listen_timeout: 3000
    },
    {
      name: 'api',
      script: './api.js',
      wait_ready: true,
      // database 시작 후 실행
      dependencies: ['database']
    }
  ]
}
```

### 3. Claude 친화적 설정
```markdown
# CLAUDE.md에 추가

## Debugging Workflow

1. Check service status: `pm2 list`
2. View recent errors: `pm2 logs --err --lines 50`
3. Check specific service: `pm2 show [service-name]`
4. Restart if needed: `pm2 restart [service-name]`
5. Monitor recovery: `pm2 logs [service-name]`

Remember: All services auto-restart on crash.
```

## 📊 실제 효과

- **디버깅 시간**: 70% 감소
- **서비스 안정성**: 크래시 자동 복구
- **Claude 자율성**: 로그 직접 확인 가능
- **개발 효율**: 멀티 서비스 한 번에 관리

---

*"Make debugging bearable with PM2"*

#pm2 #microservices #debugging #backend