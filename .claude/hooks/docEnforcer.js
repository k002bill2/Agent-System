#!/usr/bin/env node
// docEnforcer.js — 조건부 필수 문서 참조 강제
// UserPromptSubmit 훅: 프롬프트 키워드 감지 → 필수 Read 지시 주입

const fs = require('fs');

let input;
try {
  input = JSON.parse(fs.readFileSync('/dev/stdin', 'utf8'));
} catch {
  process.exit(0);
}

const prompt = (input.prompt || input.message || '').toLowerCase();

if (!prompt) {
  process.exit(0);
}

const rules = [
  {
    keywords: ['backend', 'api', '서비스', 'service', 'langgraph', '엔진',
               'engine', '마이그레이션', 'migration', 'fastapi', 'sqlalchemy',
               'pydantic', 'alembic', '라우터', 'router', '엔드포인트', 'endpoint'],
    doc: 'docs/architecture.md',
    label: 'BACKEND',
    desc: '백엔드 아키텍처, 노드 패턴, 디렉토리 구조'
  },
  {
    keywords: ['dashboard', 'component', '컴포넌트', '페이지', 'page', 'ui',
               '프론트', 'front', 'store', 'zustand', 'react', 'tsx',
               'tailwind', 'sidebar', 'modal', '스토어'],
    doc: 'docs/dashboard.md',
    label: 'FRONTEND',
    desc: '컴포넌트 목록, 스토어 패턴, 디렉토리 구조'
  },
  {
    keywords: ['기능', 'feature', '새로운 기능', '신규', '구현', 'implement'],
    doc: 'docs/features.md',
    label: 'FEATURE',
    desc: '기존 52개 기능 목록 — 중복/충돌 확인 필수'
  },
  {
    keywords: ['에이전트', 'agent', '태스크', 'task', '세션', 'session',
               '온톨로지', 'ontology', '도메인 모델'],
    doc: 'docs/ontology.md',
    label: 'DOMAIN',
    desc: '에이전트/태스크/세션 도메인 개념 관계'
  },
  {
    keywords: ['claude code 통합', 'hook', '훅', 'skill', '스킬',
               'mcp', '커맨드', 'command', 'sub-agent', '서브에이전트'],
    doc: 'docs/architecture/claude-code-integration.md',
    label: 'CLAUDE-CODE',
    desc: 'Claude Code 통합 아키텍처, 이벤트 라이프사이클'
  }
];

const matched = rules.filter(rule =>
  rule.keywords.some(kw => prompt.includes(kw))
);

if (matched.length > 0) {
  const lines = [
    '## 필수 문서 참조 (docEnforcer 감지)',
    '아래 문서를 코드 수정 전 반드시 Read 도구로 읽으세요:',
    ''
  ];
  matched.forEach(m => {
    lines.push(`- **[${m.label}]** \`${m.doc}\` — ${m.desc}`);
  });
  lines.push('');
  lines.push('문서를 읽지 않고 코드를 수정하면 기존 패턴/구조와 충돌할 수 있습니다.');
  console.log(lines.join('\n'));
}
