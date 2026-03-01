"""Code entity extraction for RAG metadata enrichment.

Extracts structured information about code entities (functions, classes, imports)
to enable relationship-aware code search beyond simple vector similarity.

Supports:
- Python: Full AST-based extraction
- TypeScript/JavaScript: Regex-based extraction (no external parser dependency)
"""

from __future__ import annotations

import ast
import re
from dataclasses import dataclass, field
from enum import StrEnum
from pathlib import Path
from typing import Any


class CodeEntityType(StrEnum):
    """Types of code entities that can be extracted."""
    FUNCTION = "function"
    CLASS = "class"
    METHOD = "method"
    VARIABLE = "variable"
    IMPORT = "import"
    MODULE = "module"
    INTERFACE = "interface"
    TYPE_ALIAS = "type_alias"
    ENUM = "enum"
    DECORATOR = "decorator"


@dataclass
class CodeEntity:
    """A single code entity extracted from source."""
    name: str
    entity_type: CodeEntityType
    file_path: str
    line_number: int
    end_line: int | None = None
    docstring: str | None = None
    imports: list[str] = field(default_factory=list)
    decorators: list[str] = field(default_factory=list)
    parent: str | None = None
    signature: str | None = None


@dataclass
class CodeDependency:
    """A dependency relationship between code entities."""
    source_entity: str  # e.g., "module.ClassName.method"
    target_entity: str  # e.g., "other_module.function"
    dependency_type: str  # "imports", "calls", "inherits", "uses"
    file_path: str
    line_number: int


class PythonEntityExtractor:
    """Extract entities from Python source using AST."""

    def extract(self, source: str, file_path: str) -> list[CodeEntity]:
        """Extract all code entities from Python source."""
        try:
            tree = ast.parse(source)
        except SyntaxError:
            return []

        entities: list[CodeEntity] = []
        self._visit_module(tree, file_path, entities)
        return entities

    def _visit_module(
        self,
        tree: ast.Module,
        file_path: str,
        entities: list[CodeEntity],
    ) -> None:
        """Walk the AST and collect entities."""
        for node in ast.iter_child_nodes(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                entities.append(self._extract_function(node, file_path))
            elif isinstance(node, ast.ClassDef):
                entities.append(self._extract_class(node, file_path))
                # Extract methods
                for item in ast.iter_child_nodes(node):
                    if isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                        entities.append(
                            self._extract_function(item, file_path, parent=node.name)
                        )
            elif isinstance(node, (ast.Import, ast.ImportFrom)):
                entities.extend(self._extract_imports(node, file_path))
            elif isinstance(node, ast.Assign):
                entity = self._extract_variable(node, file_path)
                if entity:
                    entities.append(entity)

    def _extract_function(
        self,
        node: ast.FunctionDef | ast.AsyncFunctionDef,
        file_path: str,
        parent: str | None = None,
    ) -> CodeEntity:
        """Extract function/method entity."""
        entity_type = CodeEntityType.METHOD if parent else CodeEntityType.FUNCTION
        decorators = [
            self._get_decorator_name(d) for d in node.decorator_list
        ]

        # Build signature
        args = self._format_args(node.args)
        returns = ""
        if node.returns:
            returns = f" -> {ast.unparse(node.returns)}"
        is_async = isinstance(node, ast.AsyncFunctionDef)
        prefix = "async " if is_async else ""
        signature = f"{prefix}def {node.name}({args}){returns}"

        return CodeEntity(
            name=node.name,
            entity_type=entity_type,
            file_path=file_path,
            line_number=node.lineno,
            end_line=node.end_lineno,
            docstring=ast.get_docstring(node),
            decorators=decorators,
            parent=parent,
            signature=signature,
        )

    def _extract_class(self, node: ast.ClassDef, file_path: str) -> CodeEntity:
        """Extract class entity."""
        decorators = [
            self._get_decorator_name(d) for d in node.decorator_list
        ]
        bases = [ast.unparse(base) for base in node.bases]
        signature = f"class {node.name}"
        if bases:
            signature += f"({', '.join(bases)})"

        return CodeEntity(
            name=node.name,
            entity_type=CodeEntityType.CLASS,
            file_path=file_path,
            line_number=node.lineno,
            end_line=node.end_lineno,
            docstring=ast.get_docstring(node),
            decorators=decorators,
            signature=signature,
        )

    def _extract_imports(
        self, node: ast.Import | ast.ImportFrom, file_path: str
    ) -> list[CodeEntity]:
        """Extract import entities."""
        entities = []
        if isinstance(node, ast.Import):
            for alias in node.names:
                name = alias.asname or alias.name
                entities.append(CodeEntity(
                    name=name,
                    entity_type=CodeEntityType.IMPORT,
                    file_path=file_path,
                    line_number=node.lineno,
                    imports=[alias.name],
                ))
        elif isinstance(node, ast.ImportFrom):
            module = node.module or ""
            for alias in node.names:
                name = alias.asname or alias.name
                full_import = f"{module}.{alias.name}" if module else alias.name
                entities.append(CodeEntity(
                    name=name,
                    entity_type=CodeEntityType.IMPORT,
                    file_path=file_path,
                    line_number=node.lineno,
                    imports=[full_import],
                ))
        return entities

    def _extract_variable(
        self, node: ast.Assign, file_path: str
    ) -> CodeEntity | None:
        """Extract module-level variable assignments (e.g., constants)."""
        if len(node.targets) == 1 and isinstance(node.targets[0], ast.Name):
            name = node.targets[0].id
            # Only extract UPPER_CASE constants or type aliases
            if name.isupper() or name[0].isupper():
                return CodeEntity(
                    name=name,
                    entity_type=CodeEntityType.VARIABLE,
                    file_path=file_path,
                    line_number=node.lineno,
                )
        return None

    def _get_decorator_name(self, node: ast.expr) -> str:
        """Get decorator name from AST node."""
        if isinstance(node, ast.Name):
            return node.id
        if isinstance(node, ast.Attribute):
            return ast.unparse(node)
        if isinstance(node, ast.Call):
            return self._get_decorator_name(node.func)
        return ast.unparse(node)

    def _format_args(self, args: ast.arguments) -> str:
        """Format function arguments to string."""
        parts = []
        for arg in args.args:
            if arg.arg == "self" or arg.arg == "cls":
                parts.append(arg.arg)
            elif arg.annotation:
                parts.append(f"{arg.arg}: {ast.unparse(arg.annotation)}")
            else:
                parts.append(arg.arg)
        return ", ".join(parts)

    def extract_dependencies(
        self, source: str, file_path: str
    ) -> list[CodeDependency]:
        """Extract dependency relationships from Python source."""
        try:
            tree = ast.parse(source)
        except SyntaxError:
            return []

        deps: list[CodeDependency] = []
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for alias in node.names:
                    deps.append(CodeDependency(
                        source_entity=Path(file_path).stem,
                        target_entity=alias.name,
                        dependency_type="imports",
                        file_path=file_path,
                        line_number=node.lineno,
                    ))
            elif isinstance(node, ast.ImportFrom):
                module = node.module or ""
                for alias in node.names:
                    target = f"{module}.{alias.name}" if module else alias.name
                    deps.append(CodeDependency(
                        source_entity=Path(file_path).stem,
                        target_entity=target,
                        dependency_type="imports",
                        file_path=file_path,
                        line_number=node.lineno,
                    ))
            elif isinstance(node, ast.ClassDef):
                for base in node.bases:
                    deps.append(CodeDependency(
                        source_entity=f"{Path(file_path).stem}.{node.name}",
                        target_entity=ast.unparse(base),
                        dependency_type="inherits",
                        file_path=file_path,
                        line_number=node.lineno,
                    ))
        return deps


class TypeScriptEntityExtractor:
    """Extract entities from TypeScript/JavaScript using regex patterns."""

    # Patterns for TypeScript entity extraction
    _PATTERNS: dict[CodeEntityType, list[re.Pattern[str]]] = {
        CodeEntityType.FUNCTION: [
            re.compile(
                r"^export\s+(?:async\s+)?function\s+(\w+)\s*(?:<[^>]*>)?\s*\(",
                re.MULTILINE,
            ),
            re.compile(
                r"^export\s+(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?\(",
                re.MULTILINE,
            ),
            re.compile(
                r"^export\s+(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?(?:<[^>]*>)?\s*\(",
                re.MULTILINE,
            ),
        ],
        CodeEntityType.CLASS: [
            re.compile(
                r"^export\s+(?:default\s+)?(?:abstract\s+)?class\s+(\w+)",
                re.MULTILINE,
            ),
        ],
        CodeEntityType.INTERFACE: [
            re.compile(
                r"^export\s+(?:default\s+)?interface\s+(\w+)",
                re.MULTILINE,
            ),
        ],
        CodeEntityType.TYPE_ALIAS: [
            re.compile(
                r"^export\s+type\s+(\w+)\s*(?:<[^>]*>)?\s*=",
                re.MULTILINE,
            ),
        ],
        CodeEntityType.ENUM: [
            re.compile(
                r"^export\s+(?:const\s+)?enum\s+(\w+)",
                re.MULTILINE,
            ),
        ],
        CodeEntityType.VARIABLE: [
            re.compile(
                r"^export\s+const\s+(\w+)\s*(?::\s*[^=]+)?\s*=\s*(?!(?:async\s+)?\()",
                re.MULTILINE,
            ),
        ],
    }

    _IMPORT_PATTERN = re.compile(
        r"^import\s+(?:(?:type\s+)?(?:\{[^}]+\}|\*\s+as\s+\w+|\w+)"
        r"(?:\s*,\s*(?:\{[^}]+\}|\*\s+as\s+\w+))?\s+from\s+)?['\"]([^'\"]+)['\"]",
        re.MULTILINE,
    )

    def extract(self, source: str, file_path: str) -> list[CodeEntity]:
        """Extract entities from TypeScript/JavaScript source."""
        entities: list[CodeEntity] = []
        lines = source.split("\n")

        # Extract typed entities
        for entity_type, patterns in self._PATTERNS.items():
            for pattern in patterns:
                for match in pattern.finditer(source):
                    name = match.group(1)
                    line_num = source[:match.start()].count("\n") + 1
                    # Avoid duplicate names for same entity type
                    if not any(
                        e.name == name and e.entity_type == entity_type
                        for e in entities
                    ):
                        entities.append(CodeEntity(
                            name=name,
                            entity_type=entity_type,
                            file_path=file_path,
                            line_number=line_num,
                        ))

        # Extract imports
        for match in self._IMPORT_PATTERN.finditer(source):
            module_path = match.group(1)
            line_num = source[:match.start()].count("\n") + 1
            entities.append(CodeEntity(
                name=module_path,
                entity_type=CodeEntityType.IMPORT,
                file_path=file_path,
                line_number=line_num,
                imports=[module_path],
            ))

        return entities

    def extract_dependencies(
        self, source: str, file_path: str
    ) -> list[CodeDependency]:
        """Extract dependency relationships from TypeScript source."""
        deps: list[CodeDependency] = []
        stem = Path(file_path).stem

        for match in self._IMPORT_PATTERN.finditer(source):
            module_path = match.group(1)
            line_num = source[:match.start()].count("\n") + 1
            deps.append(CodeDependency(
                source_entity=stem,
                target_entity=module_path,
                dependency_type="imports",
                file_path=file_path,
                line_number=line_num,
            ))

        return deps


# Module-level singleton extractors
_python_extractor = PythonEntityExtractor()
_typescript_extractor = TypeScriptEntityExtractor()

# File extension to extractor mapping
_PYTHON_EXTENSIONS = {".py", ".pyi"}
_TYPESCRIPT_EXTENSIONS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}


def extract_entities(file_path: str, content: str) -> list[CodeEntity]:
    """Extract code entities from a file based on its extension.

    Args:
        file_path: Path to the source file
        content: Source code content

    Returns:
        List of extracted CodeEntity objects
    """
    ext = Path(file_path).suffix.lower()

    if ext in _PYTHON_EXTENSIONS:
        return _python_extractor.extract(content, file_path)
    elif ext in _TYPESCRIPT_EXTENSIONS:
        return _typescript_extractor.extract(content, file_path)

    return []


def extract_dependencies(file_path: str, content: str) -> list[CodeDependency]:
    """Extract dependency relationships from a file based on its extension.

    Args:
        file_path: Path to the source file
        content: Source code content

    Returns:
        List of extracted CodeDependency objects
    """
    ext = Path(file_path).suffix.lower()

    if ext in _PYTHON_EXTENSIONS:
        return _python_extractor.extract_dependencies(content, file_path)
    elif ext in _TYPESCRIPT_EXTENSIONS:
        return _typescript_extractor.extract_dependencies(content, file_path)

    return []
