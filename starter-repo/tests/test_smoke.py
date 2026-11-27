"""Kiểm môi trường: khung chấm, codebase và thư viện graph đều import được."""


def test_imports():
    import tracing  # noqa: F401  (khung)
    import ai  # noqa: F401
    import tools  # noqa: F401
    import langgraph  # noqa: F401


def test_backend_package_on_path():
    import src.core.orchestration.utils.utils as u
    assert u._parse_json('{"a": 1}') == {"a": 1}
