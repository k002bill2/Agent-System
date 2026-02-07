"""Backend Integration Specialist Agent - Firebase 및 API 통합 전문가.

Firebase Auth, Firestore, Cloud Functions, REST API 연동,
데이터 동기화 전략을 담당합니다.
"""

import time
from typing import Any

from agents.base import AgentConfig, AgentResult, BaseAgent

BACKEND_SYSTEM_PROMPT = """You are a Backend Integration Specialist Agent, an expert in Firebase services and API integration for React Native applications.

## Your Expertise

1. **Firebase Services**
   - Firebase Authentication (Email, Google, Apple Sign-in)
   - Cloud Firestore (document database)
   - Realtime Database
   - Cloud Functions
   - Cloud Storage
   - Firebase Analytics

2. **API Integration**
   - REST API design and consumption
   - GraphQL client setup
   - Error handling and retry logic
   - Request/response transformation
   - API versioning strategies

3. **Data Management**
   - Offline-first architecture
   - Data synchronization strategies
   - Caching with AsyncStorage/MMKV
   - Optimistic updates
   - Conflict resolution

4. **Security**
   - Firebase Security Rules
   - Token management
   - API key protection
   - Data validation

## Code Standards

```typescript
// Service pattern example
class FirestoreService {
  private db = getFirestore();

  async getDocument<T>(collection: string, id: string): Promise<T | null> {
    try {
      const docRef = doc(this.db, collection, id);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? docSnap.data() as T : null;
    } catch (error) {
      console.error(`Failed to get document ${collection}/${id}:`, error);
      throw new DatabaseError('FETCH_FAILED', error);
    }
  }
}
```

## Output Format

When implementing backend integrations, provide:
1. **Service Code**: TypeScript service class or functions
2. **Types/Interfaces**: Data models and API types
3. **Error Handling**: Custom error types and handling
4. **Security Considerations**: Rules or best practices
5. **Usage Example**: How to use the service

## Guidelines

1. **Type Safety**: Full TypeScript coverage with generics
2. **Error Handling**: Typed errors with recovery strategies
3. **Offline Support**: Handle network failures gracefully
4. **Performance**: Batch operations, pagination, caching
5. **Security**: Never expose sensitive data, validate inputs
6. **Testing**: Make services testable with dependency injection

## Common Patterns

### Firestore Query with Pagination
```typescript
async function getPagedData<T>(
  collection: string,
  pageSize: number,
  lastDoc?: DocumentSnapshot
): Promise<{ data: T[]; lastDoc: DocumentSnapshot | null }> {
  let q = query(
    collection(db, collection),
    orderBy('createdAt', 'desc'),
    limit(pageSize)
  );

  if (lastDoc) {
    q = query(q, startAfter(lastDoc));
  }

  const snapshot = await getDocs(q);
  return {
    data: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }) as T),
    lastDoc: snapshot.docs[snapshot.docs.length - 1] || null,
  };
}
```

### API Client with Retry
```typescript
async function fetchWithRetry<T>(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<T> {
  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) throw new APIError(response.status);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (i < maxRetries - 1) {
        await delay(Math.pow(2, i) * 1000); // Exponential backoff
      }
    }
  }

  throw lastError;
}
```
"""


class BackendIntegrationAgent(BaseAgent):
    """
    Backend Integration Specialist Agent.

    Firebase 서비스 및 외부 API 연동을 전문으로 하며,
    데이터 동기화, 인증, 보안 설정을 담당합니다.
    """

    def __init__(self):
        config = AgentConfig(
            name="BackendIntegrationSpecialist",
            description="Firebase and API integration expert specializing in data sync, auth, and security",
            system_prompt=BACKEND_SYSTEM_PROMPT,
            model_name="claude-sonnet-4-20250514",
            temperature=0.4,  # 정확한 코드 생성을 위해 낮은 temperature
            max_tokens=8192,
            tools=["file_read", "file_write", "code_search", "api_test"],
        )
        super().__init__(config)

    async def execute(self, task: str, context: dict[str, Any] | None = None) -> AgentResult:
        """
        백엔드 통합 태스크 실행.

        Args:
            task: 백엔드 관련 태스크 설명
            context: 프로젝트 컨텍스트 (기존 서비스, API 정보 등)

        Returns:
            AgentResult with generated service code or analysis
        """
        start_time = time.time()

        try:
            # 컨텍스트 강화
            enhanced_context = self._enhance_context(context)

            # LLM 호출
            result = await self._invoke_llm(task, enhanced_context)
            execution_time = int((time.time() - start_time) * 1000)

            # 결과 파싱
            output = self._parse_result(result, task)

            return AgentResult(
                success=True,
                output=output,
                execution_time_ms=execution_time,
            )
        except Exception as e:
            return self._format_error(e)

    def _enhance_context(self, context: dict[str, Any] | None) -> dict[str, Any]:
        """컨텍스트 강화."""
        enhanced = context.copy() if context else {}

        # 기본 Firebase 설정 추가
        if "firebase_services" not in enhanced:
            enhanced["firebase_services"] = [
                "Authentication",
                "Cloud Firestore",
                "Cloud Functions",
            ]

        return enhanced

    def _parse_result(self, result: str, task: str) -> dict[str, Any]:
        """결과 파싱 및 구조화."""
        # 코드 블록 추출
        code_blocks = []
        if "```" in result:
            parts = result.split("```")
            for i, part in enumerate(parts):
                if i % 2 == 1:
                    lang = ""
                    content = part
                    if "\n" in part:
                        first_line = part.split("\n")[0]
                        if first_line.strip() in ["typescript", "ts", "javascript", "js", "json"]:
                            lang = first_line.strip()
                            content = "\n".join(part.split("\n")[1:])
                    code_blocks.append(
                        {
                            "language": lang or "typescript",
                            "content": content.strip(),
                        }
                    )

        # 보안 관련 내용 추출
        security_notes = []
        if "security" in result.lower():
            lines = result.split("\n")
            for _i, line in enumerate(lines):
                if "security" in line.lower():
                    security_notes.append(line.strip())

        return {
            "type": "backend_integration",
            "task": task,
            "full_response": result,
            "code_blocks": code_blocks,
            "has_code": len(code_blocks) > 0,
            "security_notes": security_notes,
        }

    async def create_firestore_service(
        self,
        collection_name: str,
        document_schema: dict[str, str],
    ) -> AgentResult:
        """
        Firestore 서비스 생성.

        Args:
            collection_name: Firestore 컬렉션 이름
            document_schema: 문서 스키마 {"field": "type"}

        Returns:
            AgentResult with Firestore service code
        """
        schema_str = "\n".join(f"  {field}: {ftype};" for field, ftype in document_schema.items())

        task = f"""Create a Firestore service for the '{collection_name}' collection.

Document Schema:
```typescript
interface {collection_name.title().replace("_", "")} {{
{schema_str}
}}
```

Include:
1. CRUD operations (create, read, update, delete)
2. Query methods with pagination
3. Real-time listener setup
4. Offline support
5. Error handling
6. TypeScript types

Also provide:
- Security rules for this collection
- Usage examples
"""

        return await self.execute(task)

    async def setup_authentication(
        self,
        providers: list[str],
    ) -> AgentResult:
        """
        Firebase 인증 설정.

        Args:
            providers: 인증 프로바이더 목록 ["email", "google", "apple"]

        Returns:
            AgentResult with authentication setup code
        """
        providers_str = ", ".join(providers)

        task = f"""Set up Firebase Authentication with the following providers: {providers_str}

Provide:
1. Auth service with sign-in/sign-out methods
2. Auth state management (context or store)
3. Protected route wrapper
4. Token refresh handling
5. Error handling for auth failures
6. TypeScript types for user data

Include:
- Configuration steps
- Security best practices
- Usage examples
"""

        return await self.execute(task)

    async def design_api_client(
        self,
        base_url: str,
        endpoints: list[dict[str, str]],
    ) -> AgentResult:
        """
        API 클라이언트 설계.

        Args:
            base_url: API 베이스 URL
            endpoints: 엔드포인트 목록 [{"method": "GET", "path": "/users", "description": "..."}]

        Returns:
            AgentResult with API client code
        """
        endpoints_str = "\n".join(
            f"- {e['method']} {e['path']}: {e.get('description', '')}" for e in endpoints
        )

        task = f"""Design an API client for the following REST API:

Base URL: {base_url}

Endpoints:
{endpoints_str}

Requirements:
1. Type-safe request/response handling
2. Automatic token injection (Authorization header)
3. Error handling with typed errors
4. Request/response interceptors
5. Retry logic with exponential backoff
6. Request cancellation support
7. Caching strategy

Provide:
- API client class/module
- Request/response types
- Error types
- Usage examples
"""

        return await self.execute(task)

    async def design_sync_strategy(
        self,
        data_model: str,
        requirements: list[str],
    ) -> AgentResult:
        """
        오프라인 우선 동기화 전략 설계.

        Args:
            data_model: 동기화할 데이터 모델 설명
            requirements: 동기화 요구사항

        Returns:
            AgentResult with sync strategy design
        """
        reqs_str = "\n".join(f"- {r}" for r in requirements)

        task = f"""Design an offline-first data synchronization strategy.

Data Model: {data_model}

Requirements:
{reqs_str}

Provide:
1. Local storage setup (AsyncStorage/MMKV/SQLite)
2. Sync queue implementation
3. Conflict resolution strategy
4. Network state handling
5. Background sync setup
6. Data validation
7. Error recovery

Include:
- Architecture diagram (text-based)
- Code implementation
- Edge case handling
"""

        return await self.execute(task)
