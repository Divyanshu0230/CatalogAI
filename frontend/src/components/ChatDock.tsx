import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { api } from "../api";
import { ASSISTANT } from "../format";
import type { ConversationDetail, ConversationSummary } from "../types";
import { ChatThread } from "./ChatThread";

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function ChatDock() {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [conversationId, setConversationId] = useState<number | null>(null);

  useEffect(() => {
    if (!open || conversationId) return;
    api<ConversationSummary[]>("/api/ai/conversations/")
      .then(async (rows) => {
        if (rows[0]) {
          setConversationId(rows[0].id);
          return;
        }
        const created = await api<ConversationDetail>("/api/ai/conversations/", { method: "POST" });
        setConversationId(created.id);
      })
      .catch(() => setConversationId(null));
  }, [open, conversationId]);

  async function startNew() {
    const created = await api<ConversationDetail>("/api/ai/conversations/", { method: "POST" });
    setConversationId(created.id);
    setMinimized(false);
  }

  if (location.pathname === "/assistant") return null;

  return (
    <div className="dock">
      {open && !minimized && (
        <section className="dock-panel" aria-label={ASSISTANT}>
          <header>
            <div className="dock-id">
              <i>C</i>
              <div>
                <strong>{ASSISTANT}</strong>
                <p>AI feature · ask the catalog</p>
              </div>
            </div>
            <div className="dock-head-actions">
              <button type="button" aria-label="New chat" onClick={() => void startNew()}>
                <Icon d="M12 5v14M5 12h14" />
              </button>
              <Link to="/assistant" aria-label="Open the full assistant">
                <Icon d="M8 4H4v4M16 4h4v4M4 16v4h4M20 16v4h-4" />
              </Link>
              <button type="button" aria-label="Minimize chat" onClick={() => setMinimized(true)}>
                <Icon d="M6 12h12" />
              </button>
              <button type="button" aria-label="Close chat" onClick={() => setOpen(false)}>
                <Icon d="M6 6l12 12M18 6L6 18" />
              </button>
            </div>
          </header>
          <ChatThread conversationId={conversationId} />
        </section>
      )}
      {open && minimized && (
        <button type="button" className="dock-mini" onClick={() => setMinimized(false)}>
          <i>C</i>
          {ASSISTANT}
        </button>
      )}
      <button
        type="button"
        className={open && !minimized ? "dock-launcher open" : "dock-launcher"}
        onClick={() => {
          if (open && !minimized) setOpen(false);
          else {
            setOpen(true);
            setMinimized(false);
          }
        }}
        aria-label={open && !minimized ? "Close chat" : "Open chat"}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M5 6.5A3.5 3.5 0 0 1 8.5 3h7A3.5 3.5 0 0 1 19 6.5v6A3.5 3.5 0 0 1 15.5 16H12l-4 4v-4H8.5A3.5 3.5 0 0 1 5 12.5z" />
        </svg>
      </button>
    </div>
  );
}
