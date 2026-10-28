import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { ImageTile } from "../components/ImageTile";
import { friendlyError, money, useTitle, ASSISTANT } from "../format";
import { findListed, InCatalog } from "../hints";
import { useToast } from "../toast";
import type { Draft, Page, Product } from "../types";

export function StudioPage() {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Product[]>([]);
  const [thin, setThin] = useState<Product[]>([]);
  const [starters, setStarters] = useState<Product[]>([]);
  const [product, setProduct] = useState<Product | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toast = useToast();
  const navigate = useNavigate();
  useTitle("AI Studio");

  useEffect(() => {
    api<Page<Product>>("/api/products/?needs=story&page_size=6")
      .then((page) => setThin(page.results))
      .catch(() => setThin([]));
    api<Page<Product>>("/api/products/?page_size=6")
      .then((page) => setStarters(page.results))
      .catch(() => setStarters([]));
  }, []);

  function showListing() {
    window.setTimeout(() => {
      document.querySelector(".work-grid")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  async function find(text: string) {
    const cleaned = text.trim();
    if (cleaned.length < 2) return;
    setError("");
    try {
      const products = await findListed(cleaned);
      setMatches(products.slice(0, 6));
      if (products[0]) {
        choose(products[0]);
        showListing();
      } else {
        setError("Nothing in the catalog matches that.");
      }
    } catch (err) {
      setError(friendlyError(err, "That search did not open a product."));
    }
  }

  async function openListed(id: number) {
    setError("");
    try {
      const item = await api<Product>(`/api/products/${id}/`);
      setQuery(`${item.brand} ${item.name}`);
      setMatches([item]);
      choose(item);
      showListing();
    } catch (err) {
      setError(friendlyError(err, "That product did not open."));
    }
  }

  function choose(item: Product) {
    setProduct(item);
    setDraft(null);
    setError("");
  }

  function openProduct(item: Product) {
    choose(item);
    navigate(`/products/${item.id}`);
  }

  async function enhance(item: Product) {
    setBusy(true);
    setError("");
    setProduct(item);
    try {
      const result = await api<Draft>("/api/ai/describe/", {
        method: "POST",
        body: JSON.stringify({
          name: item.name,
          brand: item.brand,
          category: item.category,
          currency: item.currency,
          note: item.description,
          ...(item.price ? { price: item.price } : {}),
        }),
      });
      setDraft(result);
    } catch (err) {
      setError(friendlyError(err, "Catalog Assistant AI could not write that just now."));
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!product || !draft) return;
    setBusy(true);
    setError("");
    try {
      const saved = await api<Product>(`/api/products/${product.id}/`, {
        method: "PATCH",
        body: JSON.stringify({
          name: draft.headline || product.name,
          brand: product.brand,
          category: draft.category_suggestion || product.category,
          description: draft.description,
          price: product.price,
          currency: product.currency,
          image_url: product.image_url,
          stock: product.stock,
          status: product.status,
          tags: draft.tags,
          attributes: { ...product.attributes, ...draft.attributes },
        }),
      });
      setProduct(saved);
      setDraft(null);
      toast("Saved. The listing now uses the Catalog Assistant AI draft.");
    } catch (err) {
      setError(friendlyError(err, "The draft was not saved."));
    } finally {
      setBusy(false);
    }
  }

  function onFind(event: FormEvent) {
    event.preventDefault();
    void find(query);
  }

  const notes = product
    ? [
        !product.image_url ? "This listing has no photo." : "",
        product.description.trim().length < 40 ? "The description is still short." : "",
        product.tags.length === 0 ? "There are no tags for search." : "",
        product.stock <= 5 ? `Only ${product.stock} left in stock.` : "",
      ].filter(Boolean)
    : [];

  return (
    <section>
      <header className="page-stage">
        <p className="kicker"><i className="ai-pill">AI</i> AI Studio</p>
        <h1>Rewrite a listing before you save it.</h1>
        <p>
          This page is for product copy. Find a listing, ask {ASSISTANT} for a title, description, and tags, then save only if you want that wording on the product.
        </p>
        <form className="smart-bar" onSubmit={onFind}>
          <label className="sr-only" htmlFor="studio-query">Find a product</label>
          <input id="studio-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a product, for example Masala tea" />
          <button className="btn gold" type="submit">Find</button>
        </form>
        <InCatalog
          compact
          title="Open a listed product"
          note="Pick one of these. A name that is not in the catalog will not open."
          onQuery={(text) => {
            setQuery(text);
            void find(text);
          }}
          onProduct={(id) => void openListed(id)}
        />
      </header>

      <div className="how">
        <article><span>Step 1</span><strong>Find a product</strong><p>Search by name, or pick a listing whose description is still short.</p></article>
        <article><span>Step 2</span><strong>Ask for a rewrite</strong><p>{ASSISTANT} drafts a title, description, tags, and a category. The live listing stays as it is.</p></article>
        <article><span>Step 3</span><strong>Save if you like it</strong><p>Nothing is stored until you press Save this draft.</p></article>
      </div>

      <div className="work-grid">
        <div className="panel">
          {!product && <p className="lede">Choose a product to see its current title and description.</p>}
          {product && (
            <>
              <p className="kicker">Current listing</p>
              <figure className="studio-shot">
                <ImageTile src={product.image_url} name={product.name} category={product.category} />
              </figure>
              <h2>{product.name}</h2>
              <p className="lede">{product.brand} · {product.category} · {money(product.price, product.currency)}</p>
              <p style={{ marginTop: 12 }}>{product.description || "No description yet."}</p>
              <div className="chips">
                {product.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
              </div>
              {notes.length > 0 && (
                <ul>
                  {notes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              )}
              <div className="actions" style={{ marginTop: 14 }}>
                <button type="button" className="btn" disabled={busy} onClick={() => void enhance(product)}>
                  {busy ? "Writing…" : "Rewrite with Catalog Assistant AI"}
                </button>
                <Link className="btn ghost" to={`/products/${product.id}`}>Open product</Link>
              </div>
            </>
          )}
          {matches.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <p className="kicker">Matches</p>
              {matches.map((item) => (
                <button key={item.id} type="button" className={product?.id === item.id ? "pick on" : "pick"} onClick={() => openProduct(item)}>
                  <strong>{item.brand} {item.name}</strong>
                  <span>{money(item.price, item.currency)}</span>
                </button>
              ))}
            </div>
          )}
          {error && <p className="alert">{error}</p>}
          {draft && (
            <div className="draft-card">
              <p className="kicker">Suggested draft</p>
              <h3>{draft.headline || product?.name}</h3>
              <p>{draft.description}</p>
              <div className="chips">
                {draft.tags.map((tag) => <span className="tag" key={tag}>{tag}</span>)}
              </div>
              {draft.category_suggestion && <p>Suggested category: {draft.category_suggestion}</p>}
              <button type="button" className="btn gold" disabled={busy} onClick={() => void apply()}>Save this draft</button>
              <p className="signed">{ASSISTANT}</p>
            </div>
          )}
        </div>
        <div className="panel">
          <h2>{thin.length ? "Start with a short description" : "Pick a listing"}</h2>
          <p className="section-note">
            {thin.length
              ? "These listings have little copy. Open one, rewrite it, then save it yourself."
              : "Every active listing already has a description. Open one here if you still want a new draft."}
          </p>
          {(thin.length ? thin : starters).map((item) => (
            <button key={item.id} type="button" className={product?.id === item.id ? "pick on" : "pick"} onClick={() => openProduct(item)}>
              <strong>{item.brand} {item.name}</strong>
              <span>{money(item.price, item.currency)}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
