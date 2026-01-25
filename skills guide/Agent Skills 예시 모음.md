# Agent Skills 예시 모음
#claude-code #skills #examples

## 📌 개요
Claude Code Agent Skills의 실제 예시들입니다. 각 Skill은 특정 작업에 특화되어 있으며, 필요에 따라 자동으로 로드됩니다.

---

## 🔍 Code Reviewer Skill

### 파일 위치
`.claude/skills/code-reviewer/SKILL.md`

### 전체 코드
```markdown
---
name: code-reviewer
description: Comprehensive code review for quality, security, and maintainability. Use when reviewing pull requests, code changes, or when code quality checks are needed.
---

# Code Review Skill

## Purpose
Perform thorough code reviews focusing on:
- Code quality and readability
- Security vulnerabilities
- Performance optimization
- Test coverage
- Documentation completeness

## Review Checklist

### 1. Code Quality
- [ ] Clear and descriptive variable names
- [ ] Functions are single-purpose and small
- [ ] No code duplication (DRY principle)
- [ ] Consistent coding style
- [ ] Proper abstraction levels

### 2. Security
- [ ] Input validation present
- [ ] No SQL injection vulnerabilities
- [ ] Proper authentication/authorization
- [ ] Sensitive data encrypted
- [ ] No hardcoded secrets

### 3. Performance
- [ ] Efficient algorithms (O(n) complexity analysis)
- [ ] Database queries optimized
- [ ] Caching implemented where appropriate
- [ ] No memory leaks
- [ ] Async operations handled properly

### 4. Testing
- [ ] Unit tests present (>80% coverage)
- [ ] Edge cases covered
- [ ] Integration tests for APIs
- [ ] Error scenarios tested
- [ ] Mocks/stubs used appropriately

### 5. Documentation
- [ ] JSDoc/docstrings for public methods
- [ ] README updated if needed
- [ ] Complex logic explained
- [ ] API changes documented
- [ ] Changelog updated

## Review Process

\`\`\`python
def perform_code_review(changes):
    issues = {
        'critical': [],
        'warning': [],
        'suggestion': []
    }
    
    # Step 1: Analyze changes
    for file in changes:
        check_security(file, issues)
        check_performance(file, issues)
        check_style(file, issues)
        check_tests(file, issues)
    
    # Step 2: Generate report
    return format_review_report(issues)
\`\`\`

## Output Format

### Review Summary
- **Status**: ✅ Approved / ⚠️ Needs Changes / ❌ Rejected
- **Risk Level**: Low / Medium / High
- **Test Coverage**: XX%

### Detailed Feedback
\`\`\`
🟢 **Good Practices**:
- Well-structured component architecture
- Comprehensive error handling
- Good test coverage

🟡 **Suggestions**:
- Consider extracting magic numbers to constants
- Add retry logic for network requests
- Improve variable naming in calculateTotal()

🔴 **Required Changes**:
- Fix SQL injection vulnerability in line 45
- Add input validation for user data
- Handle null pointer exception in getData()
\`\`\`

## Integration with Git

\`\`\`bash
# Pre-commit hook
#!/bin/bash
claude -p "Review staged changes using code-reviewer skill"
\`\`\`

## Best Practices
1. Run before every PR
2. Address all critical issues
3. Consider suggestions for improvement
4. Document decisions for ignored warnings
```

---

## 📊 Excel Processor Skill

### 파일 위치
`.claude/skills/excel-processor/SKILL.md`

### 전체 코드
```markdown
---
name: excel-processor
description: Process Excel files with formulas, pivot tables, and charts. Use for spreadsheet analysis, data transformation, or report generation.
---

# Excel Processing Skill

## Capabilities
- Read/write Excel files preserving formulas
- Create pivot tables and charts
- Data validation and cleaning
- Multi-sheet operations
- Conditional formatting
- VLOOKUP/HLOOKUP operations

## Dependencies
\`\`\`python
import pandas as pd
import openpyxl
from openpyxl.chart import BarChart, LineChart, Reference
from openpyxl.styles import PatternFill, Font, Alignment
from openpyxl.utils.dataframe import dataframe_to_rows
import numpy as np
\`\`\`

## Core Functions

### 1. Read Excel with Formulas
\`\`\`python
def read_excel_with_formulas(filepath):
    """
    Read Excel file preserving formulas and formatting
    """
    workbook = openpyxl.load_workbook(filepath, data_only=False)
    sheets_data = {}
    
    for sheet_name in workbook.sheetnames:
        sheet = workbook[sheet_name]
        data = []
        for row in sheet.iter_rows():
            row_data = []
            for cell in row:
                if cell.value:
                    row_data.append({
                        'value': cell.value,
                        'formula': cell.formula if hasattr(cell, 'formula') else None,
                        'format': cell.number_format
                    })
                else:
                    row_data.append(None)
            data.append(row_data)
        sheets_data[sheet_name] = data
    
    return sheets_data, workbook
\`\`\`

### 2. Create Pivot Table
\`\`\`python
def create_pivot_table(df, index, columns, values, aggfunc='sum'):
    """
    Create pivot table from dataframe
    """
    pivot = pd.pivot_table(
        df,
        index=index,
        columns=columns,
        values=values,
        aggfunc=aggfunc,
        fill_value=0
    )
    return pivot
\`\`\`

### 3. Generate Charts
\`\`\`python
def add_chart_to_sheet(worksheet, data_range, chart_type='bar'):
    """
    Add chart to Excel worksheet
    """
    if chart_type == 'bar':
        chart = BarChart()
    elif chart_type == 'line':
        chart = LineChart()
    else:
        raise ValueError(f"Unsupported chart type: {chart_type}")
    
    chart.title = "Data Analysis"
    chart.x_axis.title = "Category"
    chart.y_axis.title = "Values"
    
    data = Reference(worksheet, min_col=2, min_row=1, 
                    max_col=data_range[1], max_row=data_range[0])
    categories = Reference(worksheet, min_col=1, min_row=2, 
                          max_row=data_range[0])
    
    chart.add_data(data, titles_from_data=True)
    chart.set_categories(categories)
    
    worksheet.add_chart(chart, "E5")
    return worksheet
\`\`\`

### 4. Data Validation
\`\`\`python
def validate_and_clean_data(df):
    """
    Validate and clean dataframe
    """
    # Remove duplicates
    df = df.drop_duplicates()
    
    # Handle missing values
    numeric_columns = df.select_dtypes(include=[np.number]).columns
    df[numeric_columns] = df[numeric_columns].fillna(0)
    
    # Remove outliers (3 sigma rule)
    for col in numeric_columns:
        mean = df[col].mean()
        std = df[col].std()
        df = df[(df[col] > mean - 3*std) & (df[col] < mean + 3*std)]
    
    return df
\`\`\`

## Usage Examples

### Example 1: Monthly Sales Report
\`\`\`python
# Load sales data
df = pd.read_excel('sales_data.xlsx')

# Create pivot by region and product
pivot = create_pivot_table(
    df,
    index='Region',
    columns='Product',
    values='Sales',
    aggfunc='sum'
)

# Generate report with chart
workbook = openpyxl.Workbook()
worksheet = workbook.active
worksheet.title = "Sales Report"

# Write pivot table
for r in dataframe_to_rows(pivot, index=True, header=True):
    worksheet.append(r)

# Add chart
add_chart_to_sheet(worksheet, (len(pivot)+1, len(pivot.columns)+1))

# Save
workbook.save('sales_report.xlsx')
\`\`\`

### Example 2: Data Cleaning Pipeline
\`\`\`python
# Read multiple sheets
excel_file = pd.ExcelFile('raw_data.xlsx')
cleaned_data = {}

for sheet_name in excel_file.sheet_names:
    df = pd.read_excel(excel_file, sheet_name)
    cleaned_df = validate_and_clean_data(df)
    cleaned_data[sheet_name] = cleaned_df

# Save cleaned data
with pd.ExcelWriter('cleaned_data.xlsx', engine='openpyxl') as writer:
    for sheet_name, df in cleaned_data.items():
        df.to_excel(writer, sheet_name=sheet_name, index=False)
\`\`\`

## Output Templates

### Financial Report Template
- Summary sheet with KPIs
- Detailed transactions
- Pivot tables by category
- Trend charts
- Conditional formatting for variances

### Data Analysis Template
- Raw data sheet
- Cleaned data sheet
- Statistical summary
- Correlation matrix
- Visualization dashboard
```

---

## 🧪 Test Runner Skill

### 파일 위치
`.claude/skills/test-runner/SKILL.md`

### 전체 코드
```markdown
---
name: test-runner
description: Automated test execution, coverage analysis, and test generation. Use for running tests, fixing failures, and improving coverage.
---

# Test Runner Skill

## Capabilities
- Execute unit tests
- Run integration tests
- Generate test coverage reports
- Create missing tests
- Fix failing tests
- Performance testing

## Supported Frameworks
- JavaScript: Jest, Mocha, Vitest
- Python: pytest, unittest
- Go: testing package
- Java: JUnit, TestNG

## Test Execution

### 1. Run All Tests
\`\`\`bash
# JavaScript/TypeScript
npm test
npm run test:coverage
npm run test:watch

# Python
pytest
pytest --cov=src --cov-report=html
pytest -v --tb=short

# Go
go test ./...
go test -cover -coverprofile=coverage.out
go tool cover -html=coverage.out
\`\`\`

### 2. Run Specific Tests
\`\`\`bash
# Jest - run specific file
npm test UserService.test.ts

# Jest - run tests matching pattern
npm test -- --testNamePattern="should validate email"

# Pytest - run specific file
pytest tests/test_user.py

# Pytest - run specific test
pytest tests/test_user.py::test_email_validation
\`\`\`

## Test Generation

### Unit Test Template
\`\`\`typescript
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { UserService } from '../src/services/UserService';

describe('UserService', () => {
  let service: UserService;
  let mockRepository: jest.Mocked<UserRepository>;
  
  beforeEach(() => {
    mockRepository = {
      findById: jest.fn(),
      save: jest.fn(),
      delete: jest.fn()
    };
    service = new UserService(mockRepository);
  });
  
  describe('getUser', () => {
    it('should return user when found', async () => {
      // Arrange
      const userId = '123';
      const expectedUser = { id: userId, name: 'John' };
      mockRepository.findById.mockResolvedValue(expectedUser);
      
      // Act
      const result = await service.getUser(userId);
      
      // Assert
      expect(result).toEqual(expectedUser);
      expect(mockRepository.findById).toHaveBeenCalledWith(userId);
    });
    
    it('should throw error when user not found', async () => {
      // Arrange
      mockRepository.findById.mockResolvedValue(null);
      
      // Act & Assert
      await expect(service.getUser('999')).rejects.toThrow('User not found');
    });
  });
});
\`\`\`

### Integration Test Template
\`\`\`python
import pytest
from fastapi.testclient import TestClient
from app.main import app

@pytest.fixture
def client():
    return TestClient(app)

@pytest.fixture
def auth_headers():
    return {"Authorization": "Bearer test-token"}

class TestUserAPI:
    def test_create_user(self, client):
        # Arrange
        user_data = {
            "email": "test@example.com",
            "name": "Test User"
        }
        
        # Act
        response = client.post("/api/users", json=user_data)
        
        # Assert
        assert response.status_code == 201
        assert response.json()["email"] == user_data["email"]
    
    def test_get_user_unauthorized(self, client):
        response = client.get("/api/users/123")
        assert response.status_code == 401
    
    def test_get_user_authorized(self, client, auth_headers):
        response = client.get("/api/users/123", headers=auth_headers)
        assert response.status_code == 200
\`\`\`

## Coverage Analysis

### Generate Coverage Report
\`\`\`javascript
// package.json scripts
{
  "scripts": {
    "test:coverage": "jest --coverage",
    "test:coverage:html": "jest --coverage --coverageReporters=html",
    "test:coverage:lcov": "jest --coverage --coverageReporters=lcov"
  }
}

// jest.config.js
module.exports = {
  collectCoverage: true,
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80
    }
  },
  coveragePathIgnorePatterns: [
    "/node_modules/",
    "/tests/",
    "/.test.ts$/"
  ]
};
\`\`\`

### Improve Coverage
\`\`\`python
def analyze_coverage_gaps():
    """
    Identify untested code paths
    """
    # Run coverage analysis
    import coverage
    
    cov = coverage.Coverage()
    cov.start()
    
    # Run your tests
    pytest.main(['-q'])
    
    cov.stop()
    cov.save()
    
    # Get missing lines
    for filename in cov.get_data().measured_files():
        missing = cov.analysis(filename)[3]
        if missing:
            print(f"{filename}: Missing lines {missing}")
    
    return cov.report()
\`\`\`

## Test Debugging

### Fix Failing Tests Process
1. Run failing test in isolation
2. Add debug output
3. Check test data setup
4. Verify mocks/stubs
5. Review implementation changes
6. Update test expectations

### Debug Commands
\`\`\`bash
# Jest with debugging
node --inspect-brk node_modules/.bin/jest --runInBand

# Pytest with debugging
pytest --pdb  # Drop into debugger on failure
pytest -vv   # Very verbose output
pytest --tb=long  # Long traceback

# Go test with verbose
go test -v -run TestName
\`\`\`

## Performance Testing

### Load Test Example
\`\`\`javascript
import autocannon from 'autocannon';

const loadTest = autocannon({
  url: 'http://localhost:3000/api/endpoint',
  connections: 100,
  duration: 10,
  pipelining: 1,
  headers: {
    'content-type': 'application/json'
  }
}, (err, result) => {
  console.log('Requests per second:', result.requests.average);
  console.log('Latency (ms):', result.latency.average);
});
\`\`\`

## Best Practices
1. Write tests before fixing bugs (TDD)
2. Keep tests simple and focused
3. Use descriptive test names
4. Maintain test independence
5. Mock external dependencies
6. Regular coverage monitoring
```

---

## 📝 Documentation Generator Skill

### 파일 위치
`.claude/skills/docs-generator/SKILL.md`

### 전체 코드
```markdown
---
name: docs-generator
description: Generate comprehensive documentation including API docs, README files, and technical guides. Use for documentation tasks.
---

# Documentation Generator Skill

## Capabilities
- API documentation generation
- README file creation
- Code documentation extraction
- Markdown formatting
- Diagram generation (Mermaid)
- Changelog management

## Documentation Types

### 1. API Documentation
\`\`\`markdown
# API Documentation

## Base URL
\`https://api.example.com/v1\`

## Authentication
All API requests require authentication via Bearer token:
\`\`\`
Authorization: Bearer <token>
\`\`\`

## Endpoints

### GET /users
Retrieve a list of users.

**Parameters:**
| Name | Type | Required | Description |
|------|------|----------|-------------|
| page | integer | No | Page number (default: 1) |
| limit | integer | No | Items per page (default: 20) |
| sort | string | No | Sort field (name, created_at) |

**Response:**
\`\`\`json
{
  "data": [
    {
      "id": "123",
      "name": "John Doe",
      "email": "john@example.com",
      "created_at": "2024-01-01T00:00:00Z"
    }
  ],
  "meta": {
    "total": 100,
    "page": 1,
    "limit": 20
  }
}
\`\`\`

**Status Codes:**
- 200: Success
- 401: Unauthorized
- 429: Rate limit exceeded
\`\`\`

### 2. README Template
\`\`\`markdown
# Project Name

![Build Status](https://img.shields.io/badge/build-passing-green)
![Coverage](https://img.shields.io/badge/coverage-95%25-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)

## 📋 Table of Contents
- [About](#about)
- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
- [API](#api)
- [Contributing](#contributing)
- [License](#license)

## 🎯 About
Brief project description and purpose.

## ✨ Features
- ✅ Feature 1
- ✅ Feature 2
- ✅ Feature 3

## 🚀 Installation

### Prerequisites
- Node.js >= 16.0.0
- npm >= 8.0.0

### Steps
\`\`\`bash
# Clone repository
git clone https://github.com/user/project.git

# Install dependencies
npm install

# Setup environment
cp .env.example .env

# Run migrations
npm run migrate
\`\`\`

## 💻 Usage

### Basic Example
\`\`\`javascript
const lib = require('project-name');

const result = lib.doSomething({
  option1: 'value',
  option2: true
});
\`\`\`

## 📚 API Reference
See [API Documentation](./docs/api.md)

## 🤝 Contributing
See [CONTRIBUTING.md](./CONTRIBUTING.md)

## 📄 License
MIT © [Your Name]
\`\`\`

### 3. Code Documentation
\`\`\`javascript
/**
 * UserService - Handles user-related business logic
 * @class
 * @example
 * const userService = new UserService(repository);
 * const user = await userService.createUser(data);
 */
class UserService {
  /**
   * Creates a new user
   * @async
   * @param {Object} userData - User data object
   * @param {string} userData.email - User email address
   * @param {string} userData.name - User full name
   * @param {string} [userData.role='user'] - User role
   * @returns {Promise<User>} Created user object
   * @throws {ValidationError} If email is invalid
   * @throws {DuplicateError} If email already exists
   * @example
   * const user = await userService.createUser({
   *   email: 'john@example.com',
   *   name: 'John Doe'
   * });
   */
  async createUser(userData) {
    // Implementation
  }
}
\`\`\`

## Diagram Generation

### Architecture Diagram (Mermaid)
\`\`\`mermaid
graph TB
    Client[Client App]
    API[API Gateway]
    Auth[Auth Service]
    User[User Service]
    DB[(Database)]
    Cache[(Redis Cache)]
    
    Client --> API
    API --> Auth
    API --> User
    Auth --> DB
    User --> DB
    User --> Cache
    
    style Client fill:#e1f5fe
    style API fill:#fff9c4
    style Auth fill:#f3e5f5
    style User fill:#f3e5f5
    style DB fill:#c8e6c9
    style Cache fill:#ffccbc
\`\`\`

### Sequence Diagram
\`\`\`mermaid
sequenceDiagram
    participant C as Client
    participant A as API
    participant S as Service
    participant D as Database
    
    C->>A: POST /users
    A->>A: Validate request
    A->>S: createUser(data)
    S->>D: INSERT user
    D-->>S: User created
    S-->>A: User object
    A-->>C: 201 Created
\`\`\`

## Changelog Management

### CHANGELOG.md Template
\`\`\`markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.0] - 2024-11-03
### Added
- New feature X
- Support for Y

### Changed
- Updated dependency Z
- Improved performance of feature A

### Fixed
- Bug in component B
- Memory leak in service C

### Deprecated
- Method oldFunction() - use newFunction() instead

### Removed
- Support for legacy API v1

### Security
- Updated vulnerable dependency
\`\`\`

## Auto-generation Scripts

### Extract JSDoc to Markdown
\`\`\`javascript
const jsdoc2md = require('jsdoc-to-markdown');

async function generateDocs() {
  const docs = await jsdoc2md.render({
    files: 'src/**/*.js',
    template: '{{>main}}'
  });
  
  fs.writeFileSync('API.md', docs);
}
\`\`\`

### Generate from OpenAPI
\`\`\`bash
# Using swagger-markdown
swagger-markdown -i openapi.yaml -o API.md

# Using widdershins
widdershins openapi.yaml -o API.md --language_tabs javascript python
\`\`\`

## Best Practices
1. Keep documentation close to code
2. Use consistent formatting
3. Include examples for everything
4. Update docs with code changes
5. Version documentation
6. Use diagrams for complex concepts
```

---

## 🎯 사용 가이드

### Skill 생성 방법

1. **자동 생성 (추천)**
   ```
   "Use the skill-creator skill to help me create a skill for [작업]"
   ```

2. **수동 생성**
   ```bash
   mkdir -p .claude/skills/skill-name
   touch .claude/skills/skill-name/SKILL.md
   ```

3. **테스트**
   ```
   "Test the [skill-name] skill with this sample data"
   ```

### Skill 활용 팁

1. **명확한 설명**: description 필드가 핵심
2. **모듈화**: 하나의 Skill은 하나의 목적
3. **재사용성**: 팀과 공유 가능하게 설계
4. **버전 관리**: Git으로 관리
5. **문서화**: 사용 예시 포함

---

*태그: #claude-code #skills #examples #automation*