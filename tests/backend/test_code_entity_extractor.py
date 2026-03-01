"""Tests for code entity extraction (Python AST + TypeScript regex)."""

import pytest

from services.code_entity_extractor import (
    CodeDependency,
    CodeEntity,
    CodeEntityType,
    PythonEntityExtractor,
    TypeScriptEntityExtractor,
    extract_dependencies,
    extract_entities,
)


class TestPythonEntityExtractor:
    """Tests for Python AST-based entity extraction."""

    @pytest.fixture
    def extractor(self):
        return PythonEntityExtractor()

    def test_function_extraction(self, extractor):
        source = '''
def hello(name: str) -> str:
    """Say hello."""
    return f"Hello, {name}"

async def fetch_data(url: str) -> dict:
    """Fetch data from URL."""
    pass
'''
        entities = extractor.extract(source, "test.py")
        funcs = [e for e in entities if e.entity_type == CodeEntityType.FUNCTION]

        assert len(funcs) == 2
        assert funcs[0].name == "hello"
        assert funcs[0].docstring == "Say hello."
        assert "name: str" in funcs[0].signature
        assert "-> str" in funcs[0].signature

        assert funcs[1].name == "fetch_data"
        assert "async def" in funcs[1].signature

    def test_class_extraction(self, extractor):
        source = '''
class MyService(BaseService):
    """A service class."""

    def process(self, data: dict) -> bool:
        """Process data."""
        return True

    async def async_method(self) -> None:
        pass
'''
        entities = extractor.extract(source, "test.py")
        classes = [e for e in entities if e.entity_type == CodeEntityType.CLASS]
        methods = [e for e in entities if e.entity_type == CodeEntityType.METHOD]

        assert len(classes) == 1
        assert classes[0].name == "MyService"
        assert "BaseService" in classes[0].signature
        assert classes[0].docstring == "A service class."

        assert len(methods) == 2
        assert methods[0].name == "process"
        assert methods[0].parent == "MyService"
        assert methods[1].name == "async_method"

    def test_import_extraction(self, extractor):
        source = '''
import os
import json
from pathlib import Path
from typing import Any, Optional
from ..models import TaskNode
'''
        entities = extractor.extract(source, "test.py")
        imports = [e for e in entities if e.entity_type == CodeEntityType.IMPORT]

        assert len(imports) >= 5
        names = [e.name for e in imports]
        assert "os" in names
        assert "json" in names
        assert "Path" in names
        assert "Any" in names

    def test_variable_extraction(self, extractor):
        source = '''
MAX_RETRIES = 3
DEFAULT_TIMEOUT = 30
_private = "hidden"
simple = 42
'''
        entities = extractor.extract(source, "test.py")
        vars_ = [e for e in entities if e.entity_type == CodeEntityType.VARIABLE]

        # Should capture UPPER_CASE and PascalCase only
        names = [v.name for v in vars_]
        assert "MAX_RETRIES" in names
        assert "DEFAULT_TIMEOUT" in names

    def test_decorator_extraction(self, extractor):
        source = '''
@app.route("/api")
@require_auth
def endpoint():
    pass
'''
        entities = extractor.extract(source, "test.py")
        funcs = [e for e in entities if e.entity_type == CodeEntityType.FUNCTION]

        assert len(funcs) == 1
        assert "app.route" in funcs[0].decorators
        assert "require_auth" in funcs[0].decorators

    def test_syntax_error_returns_empty(self, extractor):
        source = "def incomplete("
        entities = extractor.extract(source, "test.py")
        assert entities == []

    def test_dependency_extraction(self, extractor):
        source = '''
import os
from pathlib import Path
from models.base import BaseModel

class Child(BaseModel):
    pass
'''
        deps = extractor.extract_dependencies(source, "test.py")

        import_deps = [d for d in deps if d.dependency_type == "imports"]
        assert len(import_deps) >= 3

        inherit_deps = [d for d in deps if d.dependency_type == "inherits"]
        assert len(inherit_deps) == 1
        assert inherit_deps[0].target_entity == "BaseModel"


class TestTypeScriptEntityExtractor:
    """Tests for TypeScript regex-based entity extraction."""

    @pytest.fixture
    def extractor(self):
        return TypeScriptEntityExtractor()

    def test_function_extraction(self, extractor):
        source = '''
export function fetchData(url: string): Promise<Data> {
  return fetch(url);
}

export async function processItems(items: Item[]): Promise<void> {
  // process
}
'''
        entities = extractor.extract(source, "test.ts")
        funcs = [e for e in entities if e.entity_type == CodeEntityType.FUNCTION]

        assert len(funcs) == 2
        names = [f.name for f in funcs]
        assert "fetchData" in names
        assert "processItems" in names

    def test_class_extraction(self, extractor):
        source = '''
export class UserService {
  async getUser(id: string) { }
}

export default class AppController {
  start() { }
}
'''
        entities = extractor.extract(source, "test.ts")
        classes = [e for e in entities if e.entity_type == CodeEntityType.CLASS]

        assert len(classes) == 2
        names = [c.name for c in classes]
        assert "UserService" in names
        assert "AppController" in names

    def test_interface_extraction(self, extractor):
        source = '''
export interface UserProps {
  name: string;
  age: number;
}

export default interface Config {
  apiUrl: string;
}
'''
        entities = extractor.extract(source, "test.ts")
        interfaces = [e for e in entities if e.entity_type == CodeEntityType.INTERFACE]

        assert len(interfaces) == 2
        names = [i.name for i in interfaces]
        assert "UserProps" in names
        assert "Config" in names

    def test_type_alias_extraction(self, extractor):
        source = '''
export type UserId = string;
export type Status = 'active' | 'inactive';
export type Result<T> = { data: T; error: string | null };
'''
        entities = extractor.extract(source, "test.ts")
        types = [e for e in entities if e.entity_type == CodeEntityType.TYPE_ALIAS]

        assert len(types) == 3
        names = [t.name for t in types]
        assert "UserId" in names
        assert "Status" in names
        assert "Result" in names

    def test_enum_extraction(self, extractor):
        source = '''
export enum Direction {
  Up = "UP",
  Down = "DOWN",
}

export const enum Color {
  Red,
  Blue,
}
'''
        entities = extractor.extract(source, "test.ts")
        enums = [e for e in entities if e.entity_type == CodeEntityType.ENUM]

        assert len(enums) == 2
        names = [e.name for e in enums]
        assert "Direction" in names
        assert "Color" in names

    def test_import_extraction(self, extractor):
        source = '''
import { useState, useEffect } from 'react';
import type { FC } from 'react';
import axios from 'axios';
import * as utils from './utils';
'''
        entities = extractor.extract(source, "test.ts")
        imports = [e for e in entities if e.entity_type == CodeEntityType.IMPORT]

        assert len(imports) >= 3
        import_paths = [i.name for i in imports]
        assert "react" in import_paths
        assert "axios" in import_paths

    def test_dependency_extraction(self, extractor):
        source = '''
import { api } from './api';
import { User } from '../types';
'''
        deps = extractor.extract_dependencies(source, "test.ts")

        assert len(deps) == 2
        targets = [d.target_entity for d in deps]
        assert "./api" in targets
        assert "../types" in targets


class TestModuleLevelFunctions:
    """Tests for module-level routing functions."""

    def test_python_file_routing(self):
        source = "def hello(): pass"
        entities = extract_entities("test.py", source)
        assert len(entities) >= 1
        assert entities[0].entity_type == CodeEntityType.FUNCTION

    def test_typescript_file_routing(self):
        source = "export function hello() { }"
        entities = extract_entities("test.ts", source)
        assert len(entities) >= 1
        assert entities[0].entity_type == CodeEntityType.FUNCTION

    def test_tsx_file_routing(self):
        source = "export function Component() { return <div />; }"
        entities = extract_entities("test.tsx", source)
        assert len(entities) >= 1

    def test_jsx_file_routing(self):
        source = "export function Component() { return <div />; }"
        entities = extract_entities("test.jsx", source)
        assert len(entities) >= 1

    def test_unknown_extension_returns_empty(self):
        entities = extract_entities("test.rb", "def hello; end")
        assert entities == []

    def test_python_dependency_routing(self):
        source = "import os"
        deps = extract_dependencies("test.py", source)
        assert len(deps) == 1

    def test_typescript_dependency_routing(self):
        source = "import { x } from './lib';"
        deps = extract_dependencies("test.ts", source)
        assert len(deps) == 1

    def test_unknown_extension_deps_empty(self):
        deps = extract_dependencies("test.rb", "require 'json'")
        assert deps == []
