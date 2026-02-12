"""Tests for variable expander."""

import pytest

from services.variable_expander import expand_variables, mask_secrets, parse_step_outputs


class TestExpandVariables:
    def test_env_variable(self):
        result = expand_variables("echo ${{ env.CI }}", env={"CI": "true"})
        assert result == "echo true"

    def test_matrix_variable(self):
        result = expand_variables("python ${{ matrix.python }}", matrix={"python": "3.12"})
        assert result == "python 3.12"

    def test_secrets_variable(self):
        result = expand_variables("token=${{ secrets.API_KEY }}", secrets={"API_KEY": "secret123"})
        assert result == "token=secret123"

    def test_inputs_variable(self):
        result = expand_variables("deploy ${{ inputs.env }}", inputs={"env": "production"})
        assert result == "deploy production"

    def test_step_outputs(self):
        result = expand_variables(
            "version=${{ steps.build.outputs.version }}",
            steps={"build": {"outputs": {"version": "1.0.0"}}},
        )
        assert result == "version=1.0.0"

    def test_multiple_variables(self):
        result = expand_variables(
            "${{ env.CI }} ${{ matrix.os }}",
            env={"CI": "true"},
            matrix={"os": "ubuntu"},
        )
        assert result == "true ubuntu"

    def test_unresolved_variable_returns_original(self):
        result = expand_variables("${{ env.MISSING }}", env={})
        assert result == ""

    def test_no_variables(self):
        result = expand_variables("echo hello")
        assert result == "echo hello"

    def test_nested_step_outputs(self):
        result = expand_variables(
            "${{ steps.test.outputs.coverage }}",
            steps={"test": {"outputs": {"coverage": "85%"}}},
        )
        assert result == "85%"

    def test_empty_text(self):
        result = expand_variables("")
        assert result == ""

    def test_mixed_namespaces(self):
        result = expand_variables(
            "${{ env.CI }} ${{ matrix.python }} ${{ secrets.TOKEN }}",
            env={"CI": "true"},
            matrix={"python": "3.12"},
            secrets={"TOKEN": "abc"},
        )
        assert result == "true 3.12 abc"

    def test_whitespace_in_expression(self):
        result = expand_variables("${{  env.CI  }}", env={"CI": "true"})
        assert result == "true"


class TestMaskSecrets:
    def test_mask_single_secret(self):
        result = mask_secrets("token=secret123", {"API_KEY": "secret123"})
        assert result == "token=***"

    def test_mask_multiple_secrets(self):
        result = mask_secrets(
            "a=abc b=xyz",
            {"A": "abc", "B": "xyz"},
        )
        assert result == "a=*** b=***"

    def test_no_secrets(self):
        result = mask_secrets("hello world", {})
        assert result == "hello world"

    def test_none_secrets(self):
        result = mask_secrets("hello world", None)
        assert result == "hello world"


class TestParseStepOutputs:
    def test_parse_single_output(self):
        stdout = "::set-output name=version::1.0.0\n"
        result = parse_step_outputs(stdout)
        assert result == {"version": "1.0.0"}

    def test_parse_multiple_outputs(self):
        stdout = "::set-output name=a::hello\n::set-output name=b::world\n"
        result = parse_step_outputs(stdout)
        assert result == {"a": "hello", "b": "world"}

    def test_no_outputs(self):
        result = parse_step_outputs("just some output\n")
        assert result == {}

    def test_mixed_output(self):
        stdout = "Building...\n::set-output name=status::ok\nDone.\n"
        result = parse_step_outputs(stdout)
        assert result == {"status": "ok"}

    def test_empty_value(self):
        stdout = "::set-output name=empty::\n"
        result = parse_step_outputs(stdout)
        assert result == {"empty": ""}
