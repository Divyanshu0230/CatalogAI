import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { ASSISTANT, friendlyError, money } from "../format";
import { CHAT_TRIES } from "../hints";
import type { ChatMessage, ConversationDetail } from "../types";

const OPENERS = CHAT_TRIES;

export function ChatThread({
  conversationId,
  onActivity,
}: {
  conversationId: number | null;
  onActivity?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [suggestions, setSuggestions] = useState(OPENERS);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!conversationId) return;
    setError("");
    setMessages([]);
    api<ConversationDetail>(`/api/ai/conversations/${conversationId}/`)
      .then((data) => setMessages(data.messages))
      .catch((err: unknown) => setError(friendlyError(err, "This chat did not open.")));
  }, [conversationId]);

  useEffect(() => {
    const node = scroller.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight });
  }, [messages, busy]);

  async function send(text: string) {
    const cleaned = text.trim();
    if (!cleaned || busy || !conversationId) return;
    setBusy(true);
    setError("");
    setDraft("");
    setMessages((current) => [
      ...current,
      { id: Date.now(), role: "user", content: cleaned, products: [], created_at: new Date().toISOString() },
    ]);
    try {
      const data = await api<{ reply: ChatMessage; suggestions: string[] }>(
        `/api/ai/conversations/${conversationId}/messages/`,
        { method: "POST", body: JSON.stringify({ content: cleaned }) },
      );
      setSuggestions(data.suggestions?.length ? data.suggestions : OPENERS);
      setMessages((current) => [...current, data.reply]);
      onActivity?.();
    } catch (err) {
      setError(friendlyError(err, "That message did not go through. Send it again."));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void send(draft);
  }

  return (
    <div className="thread">
      <div className="dock-log" ref={scroller}>
        {messages.map((message) =>
          message.role === "assistant" ? (
            <article key={message.id} className="turn">
              <div className="bubble">
                <p>{message.content}</p>
                {message.products.length > 0 && (
                  <div className="dock-products">
                    {message.products.map((product) => (
                      <Link key={product.id} to={`/products/${product.id}`}>
                        <span>{product.brand}</span>
                        <strong>{product.name}</strong>
                        <em>{money(product.price, product.currency)}</em>
                      </Link>
                    ))}
                  </div>
                )}
                <footer>{ASSISTANT}</footer>
              </div>
            </article>
          ) : (
            <article key={message.id} className="turn me">
              <div className="bubble me">
                <p>{message.content}</p>
              </div>
            </article>
          ),
        )}
        {busy && (
          <article className="turn">
            <div className="bubble">
              <p>One moment…</p>
              <footer>{ASSISTANT}</footer>
            </div>
          </article>
        )}
        {messages.length === 0 && !busy && (
          <p className="lede">Ask for something listed, such as tea, Nike, watches, or headphones. A random product name will not be in this catalog.</p>
        )}
        {error && <p className="alert">{error}</p>}
      </div>
      <div className="dock-suggestions">
        {suggestions.map((item) => (
          <button key={item} type="button" onClick={() => void send(item)} disabled={busy || !conversationId}>
            {item}
          </button>
        ))}
      </div>
      <form onSubmit={onSubmit}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={`Message ${ASSISTANT}`}
          aria-label="Message"
        />
        <button className="btn gold" type="submit" disabled={busy || draft.trim().length < 2}>
          Send
        </button>
      </form>
    </div>
  );
}
