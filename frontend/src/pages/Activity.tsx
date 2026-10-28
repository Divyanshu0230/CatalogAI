import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import { ErrorNote } from "../components/States";
import { day, useTitle, when } from "../format";
import type { ActivityItem, Page } from "../types";

const LABELS: Record<string, string> = {
  created: "Added",
  updated: "Edited",
  deleted: "Removed",
  imported: "Imported",
  described: "AI draft",
  chatted: "Chat",
  searched: "Search",
  rescan: "Refresh",
};

export function ActivityPage() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [error, setError] = useState("");
  useTitle("Activity");

  useEffect(() => {
    api<Page<ActivityItem>>(`/api/activity/?page=${page}`)
      .then((data) => {
        setItems(data.results);
        setPages(data.pages);
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "The activity log did not load."));
  }, [page]);

  const groups = new Map<string, ActivityItem[]>();
  items.forEach((item) => {
    const key = day(item.created_at);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  });

  return (
    <section>
      <header className="page-stage">
        <p className="kicker">Activity</p>
        <h1>What changed in this catalog.</h1>
        <p>
          Activity is the record of work on CatalogAI. It shows who added or edited a product, who imported a file, who searched, and who asked Catalog Assistant AI. It is not a chat, and it does not change a product.
        </p>
      </header>
      <div className="how">
        <article><span>Added or edited</span><strong>Product changes</strong><p>A new listing, a saved description, or a product removed from the catalog.</p></article>
        <article><span>Search and chat</span><strong>Questions people asked</strong><p>Smart Search and Catalog Assistant AI leave a line here so you can see what was asked.</p></article>
        <article><span>Refresh</span><strong>Catalog checks</strong><p>A dashboard refresh looks again for low stock, odd prices, and close names.</p></article>
      </div>
      {error && <ErrorNote text={error} />}
      {items.length === 0 && !error && <p className="lede">No activity on this page yet.</p>}
      <div className="feed">
        {[...groups.entries()].map(([label, events]) => (
          <div key={label}>
            <p className="feed-day">{label}</p>
            {events.map((event) => (
              <article className="feed-item" key={event.id}>
                <time dateTime={event.created_at}>{when(event.created_at)}</time>
                <em>{LABELS[event.action] || "Update"}</em>
                <p><strong>{event.actor || "Catalog"}</strong> · {event.summary}</p>
              </article>
            ))}
          </div>
        ))}
      </div>
      {pages > 1 && (
        <div className="pager">
          <button type="button" className="btn ghost small" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</button>
          <span>{page} of {pages}</span>
          <button type="button" className="btn ghost small" disabled={page >= pages} onClick={() => setPage((value) => value + 1)}>Next</button>
        </div>
      )}
      <div className="actions" style={{ marginTop: 18 }}>
        <Link className="btn ghost" to="/insights">Open the dashboard</Link>
      </div>
    </section>
  );
}
