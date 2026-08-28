"""Graph endpoints never call embeddings until explicitly requested."""
from unittest.mock import AsyncMock, Mock

import pytest

from app.models.note import Note
from app.models.note_link import NoteLink
from tests.fakes import TEST_USER_ID

HEADERS = {"Authorization": "Bearer x"}


async def seed_graph(db_session, count=3):
    notes = [Note(id=f"graph-{i}", user_id=TEST_USER_ID, title=f"Title {i}", content=f"Content {i}") for i in range(count)]
    db_session.add_all(notes)
    db_session.add(Note(id="other-user-note", user_id="someone-else", title="Private", content="Private content"))
    await db_session.commit()
    if count > 1:
        db_session.add(NoteLink(id="graph-link", user_id=TEST_USER_ID, note_id=notes[0].id, linked_title=notes[1].title))
        await db_session.commit()
    return notes


@pytest.mark.parametrize("query", ["", "?include_semantic=false"])
async def test_graph_defaults_to_saved_links_only(client, real_note_service, db_session, monkeypatch, query):
    await seed_graph(db_session)
    retrieval = AsyncMock(side_effect=AssertionError("Default graph must not invoke retrieval"))
    monkeypatch.setattr(real_note_service, "get_related_notes", retrieval)
    body = (await client.get("/note/graph" + query, headers=HEADERS)).json()["data"]
    assert len(body["nodes"]) == 3
    assert body["links"] == [{"source": "graph-0", "target": "graph-1", "type": "link"}]
    assert body["semantic_status"] == "not_requested"
    retrieval.assert_not_called()


async def test_graph_semantic_is_explicit_and_never_queries_knowledge(client, real_note_service, db_session, monkeypatch):
    await seed_graph(db_session)
    retrieval = AsyncMock(return_value=[{"id": "graph-2", "source": "note"}, {"id": "other-user-note", "source": "note"}])
    monkeypatch.setattr(real_note_service, "get_related_notes", retrieval)
    body = (await client.get("/note/graph?include_semantic=true", headers=HEADERS)).json()["data"]
    assert body["semantic_status"] == "complete"
    assert retrieval.await_count == 3
    assert any(link["type"] == "similar" for link in body["links"])
    assert all(link["target"] != "other-user-note" for link in body["links"])
    for call in retrieval.await_args_list:
        assert call.kwargs["include_knowledge"] is False
        assert call.kwargs["raise_errors"] is True


async def test_graph_stops_after_first_502_and_reports_degradation(client, real_note_service, db_session, monkeypatch):
    from langchain_core.documents import Document
    notes = await seed_graph(db_session)
    real_note_service.notes_store.add_documents([
        Document(page_content=n.content, metadata={"note_id": n.id, "user_id": TEST_USER_ID, "doc_type": "note"}) for n in notes
    ], ids=[n.id for n in notes])
    search = Mock(side_effect=RuntimeError("embedding gateway 502"))
    monkeypatch.setattr(real_note_service.notes_store, "similarity_search_with_score", search)
    response = await client.get("/note/graph?include_semantic=true", headers=HEADERS)
    assert response.status_code == 200  # Saved graph is usable, semantic status is explicit.
    body = response.json()["data"]
    assert body["semantic_status"] == "unavailable"
    assert len(body["nodes"]) == 3
    assert body["links"] == [{"source": "graph-0", "target": "graph-1", "type": "link"}]
    assert search.call_count == 1


async def test_graph_partial_result_retains_links(client, real_note_service, db_session, monkeypatch):
    await seed_graph(db_session)
    retrieval = AsyncMock(side_effect=[[], RuntimeError("502"), AssertionError("Must stop")])
    monkeypatch.setattr(real_note_service, "get_related_notes", retrieval)
    body = (await client.get("/note/graph?include_semantic=true", headers=HEADERS)).json()["data"]
    assert body["semantic_status"] == "partial"
    assert retrieval.await_count == 2
    assert any(link["type"] == "link" for link in body["links"])


@pytest.mark.parametrize("count", [0, 1])
async def test_graph_skips_semantic_for_fewer_than_two_notes(client, real_note_service, db_session, monkeypatch, count):
    await seed_graph(db_session, count)
    retrieval = AsyncMock()
    monkeypatch.setattr(real_note_service, "get_related_notes", retrieval)
    body = (await client.get("/note/graph?include_semantic=true", headers=HEADERS)).json()["data"]
    assert len(body["nodes"]) == count
    assert body["semantic_status"] == "complete"
    retrieval.assert_not_called()
