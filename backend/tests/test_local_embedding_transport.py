"""Loopback embeddings bypass proxies; remote model routes are unchanged."""
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from app.utils.factory import EmbedModelFactory


@pytest.mark.parametrize("url,local", [
    ("http://localhost:11434/v1", True),
    ("http://127.0.0.1:11434/v1", True),
    ("http://[::1]:11434/v1", True),
    ("https://embedding.example/v1", False),
    ("https://localhost.example/v1", False),
])
def test_embedding_proxy_scope(monkeypatch, url, local):
    import httpx
    import langchain_openai
    monkeypatch.setenv("EMBED_BASE_URL", url)
    monkeypatch.setenv("EMBED_API_KEY", "test-key")
    monkeypatch.setenv("EMBED_MODEL_NAME", "test-model")
    sync = Mock(return_value=object())
    asynchronous = Mock(return_value=object())
    monkeypatch.setattr(httpx, "Client", sync)
    monkeypatch.setattr(httpx, "AsyncClient", asynchronous)
    monkeypatch.setattr(langchain_openai, "OpenAIEmbeddings", lambda **kwargs: SimpleNamespace(**kwargs))
    model = EmbedModelFactory().generator()
    assert model.model == "test-model"
    if local:
        sync.assert_called_once_with(trust_env=False)
        asynchronous.assert_called_once_with(trust_env=False)
        assert model.openai_proxy is None
    else:
        sync.assert_not_called()
        asynchronous.assert_not_called()
        assert not hasattr(model, "http_client")
