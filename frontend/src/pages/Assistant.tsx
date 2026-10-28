import { useEffect, useState } from "react";
import { api } from "../api";
import { ChatThread } from "../components/ChatThread";
import { ASSISTANT, friendlyError, useTitle, when } from "../format";
import type { ConversationDetail, ConversationSummary } from "../types";

export function AssistantPage() {
  const [rows, setRows] = useState<ConversationSummary[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [error, setError] = useState("");
  useTitle(ASSISTANT);

  function load(selectId?: number) {
    return api<ConversationSummary[]>("/api/ai/conversations/").then((list) => {
      setRows(list);
      setCurrentId((current) => selectId ?? current ?? list[0]?.id ?? null);
    });
  }

  useEffect(() => {
    load().catch((err: unknown) => setError(friendlyError(err, "Chats did not load.")));
  }, []);

  async function startNew() {
    const created = await api<ConversationDetail>("/api/ai/conversations/", { method: "POST" });
    setCurrentId(created.id);
    await load(created.id);
  }

  async function remove(id: number) {
    await api(`/api/ai/conversations/${id}/`, { method: "DELETE" });
    setCurrentId((current) => (current === id ? null : current));
    await load();
  }

  const current = rows.find((row) => row.id === currentId);

  return (
    <section className="assistant">
      <aside className="panel chat-list">
        <div className="assistant-brand">
          <i>C</i>
          <div>
            <strong>{ASSISTANT}</strong>
            <p>Your saved chats</p>
          </div>
        </div>
        <button type="button" className="btn gold" onClick={() => void startNew()}>
          New chat
        </button>
        {error && <p className="alert">{error}</p>}
        <div className="chat-scroll">
          {rows.length === 0 && <p className="lede">No chats yet.</p>}
          {rows.map((row) => (
            <div key={row.id} className={row.id === currentId ? "chat-row on" : "chat-row"}>
              <button type="button" onClick={() => setCurrentId(row.id)}>
                <strong>{row.title}</strong>
                <span>{when(row.updated_at)}</span>
              </button>
              <button type="button" className="chat-delete" aria-label={`Delete ${row.title}`} onClick={() => void remove(row.id)}>
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      </aside>
      <div className="panel assistant-main">
        <header className="assistant-top">
          <div>
            <p className="kicker"><i className="ai-pill">AI</i> {ASSISTANT}</p>
            <h1>{current?.title || "New chat"}</h1>
          </div>
        </header>
        {currentId ? (
          <ChatThread conversationId={currentId} onActivity={() => void load(currentId)} />
        ) : (
          <p className="lede assistant-empty">Start a chat. It stays in the list on the left.</p>
        )}
      </div>
    </section>
  );
}
