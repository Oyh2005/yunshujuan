"""Empty stores and other users' documents must not invoke model retrieval."""
from unittest.mock import Mock

import pytest
from langchain_core.documents import Document

from app.models.note import Note
from tests.conftest import install_fake_vector_store

USER = "retrieval-user"


async def seed_note(db_session, service, note_id="current", user_id=USER, content="A note"):
    db_session.add(Note(id=note_id, user_id=user_id, title=note_id, content=content))
    await db_session.commit()
    service.notes_store.add_documents([Document(page_content=content, metadata={"note_id": note_id, "user_id": user_id, "doc_type": "note"})], ids=[note_id])


@pytest.mark.parametrize("foreign_document", [False, True])
async def test_empty_user_knowledge_skips_embedding(real_note_service, db_session, monkeypatch, foreign_document):
    install_fake_vector_store(monkeypatch)
    from app.rag.vector_store import VectorStoreService
    kb_store = VectorStoreService().vectors_store
    if foreign_document:
        kb_store.add_documents([Document(page_content="Private", metadata={"user_id": "other-user"})], ids=["private"])
    kb_search = Mock(side_effect=AssertionError("No embedding for an empty user library"))
    note_search = Mock(side_effect=AssertionError("No embedding when only the source note exists"))
    monkeypatch.setattr(kb_store, "similarity_search_with_score", kb_search)
    monkeypatch.setattr(real_note_service.notes_store, "similarity_search_with_score", note_search)
    await seed_note(db_session, real_note_service)
    assert await real_note_service.get_related_notes(db_session, "current", USER) == []
    kb_search.assert_not_called()
    note_search.assert_not_called()


async def test_note_retrieval_is_scoped_to_current_user(real_note_service, db_session, monkeypatch):
    await seed_note(db_session, real_note_service)
    await seed_note(db_session, real_note_service, "mine")
    await seed_note(db_session, real_note_service, "private", user_id="other-user")
    original = real_note_service.notes_store.similarity_search_with_score
    search = Mock(wraps=original)
    monkeypatch.setattr(real_note_service.notes_store, "similarity_search_with_score", search)
    result = await real_note_service.get_related_notes(db_session, "current", USER, include_knowledge=False)
    assert [item["id"] for item in result] == ["mine"]
    assert search.call_args.kwargs["filter"] == {"$and": [{"user_id": USER}, {"doc_type": "note"}]}


async def test_empty_source_content_skips_all_retrieval(real_note_service, db_session, monkeypatch):
    await seed_note(db_session, real_note_service, content=" \n ")
    probe = Mock(side_effect=AssertionError("Blank notes must not access vectors"))
    monkeypatch.setattr(real_note_service.notes_store, "get", probe)
    assert await real_note_service.get_related_notes(db_session, "current", USER) == []
    probe.assert_not_called()
