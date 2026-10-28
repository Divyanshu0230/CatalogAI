import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import { ImageTile } from "../components/ImageTile";
import { Empty, ErrorNote } from "../components/States";
import { ASSISTANT, money, useTitle } from "../format";
import { findListed, InCatalog } from "../hints";
import { useToast } from "../toast";
import type { Collection, Page, Product } from "../types";

export function CollectionsPage() {
  const [sets, setSets] = useState<Collection[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [briefing, setBriefing] = useState(false);
  const toast = useToast();
  useTitle("Collections");

  async function load(selectId?: number) {
    const page = await api<Page<Collection>>("/api/collections/?page_size=24");
    setSets(page.results);
    setCurrentId((current) => selectId ?? current ?? page.results[0]?.id ?? null);
  }

  useEffect(() => {
    load().catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Collections did not load."));
  }, []);

  useEffect(() => {
    if (query.trim().length < 2) {
      setMatches([]);
      return;
    }
    const handle = window.setTimeout(() => {
      findListed(query.trim())
        .then((products) => setMatches(products.slice(0, 5)))
        .catch(() => setMatches([]));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [query]);

  const current = sets.find((item) => item.id === currentId) ?? null;

  async function create(event: FormEvent) {
    event.preventDefault();
    const created = await api<Collection>("/api/collections/", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    setName("");
    toast(`Opened “${created.name}”.`);
    await load(created.id);
  }

  async function addProduct(product: Product) {
    if (!current) return;
    const ids = Array.from(new Set([...current.products.map((item) => item.id), product.id]));
    const updated = await api<Collection>(`/api/collections/${current.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ product_ids: ids }),
    });
    setSets((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    setQuery("");
    setMatches([]);
    toast(`Added ${product.name}.`);
  }

  async function removeProduct(productId: number) {
    if (!current) return;
    const updated = await api<Collection>(`/api/collections/${current.id}/`, {
      method: "PATCH",
      body: JSON.stringify({ product_ids: current.products.filter((item) => item.id !== productId).map((item) => item.id) }),
    });
    setSets((items) => items.map((item) => (item.id === updated.id ? updated : item)));
  }

  async function writeBrief() {
    if (!current) return;
    setBriefing(true);
    try {
      const updated = await api<Collection>(`/api/collections/${current.id}/brief/`, { method: "POST" });
      setSets((items) => items.map((item) => (item.id === updated.id ? updated : item)));
      toast("Collection note is ready.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The note did not come back.");
    } finally {
      setBriefing(false);
    }
  }

  async function removeSet() {
    if (!current) return;
    await api(`/api/collections/${current.id}/`, { method: "DELETE" });
    toast(`Removed “${current.name}”.`);
    setCurrentId(null);
    await load();
  }

  return (
    <section>
      <header className="page-stage">
        <p className="kicker">Collections</p>
        <h1>Group products that belong together.</h1>
        <p>
          A collection is a named group, such as a monsoon shelf or a gift list. It does not change the product itself. You name it, add products, then ask {ASSISTANT} for a short note about the group.
        </p>
        <form className="smart-bar" onSubmit={create}>
          <label className="sr-only" htmlFor="collection-name">Collection name</label>
          <input id="collection-name" placeholder="Name a collection, for example Monsoon shelf" value={name} onChange={(event) => setName(event.target.value)} required />
          <button className="btn gold" type="submit">Create</button>
        </form>
        <InCatalog
          compact
          title="Products you can add"
          note="After you open a collection, search one of these names."
          onQuery={setQuery}
          onProduct={(id) => {
            void api<Product>(`/api/products/${id}/`)
              .then((item) => {
                if (!current) {
                  setQuery(`${item.brand} ${item.name}`);
                  setError("Open a collection first, then add this product.");
                  return;
                }
                return addProduct(item);
              })
              .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "That product did not open."));
          }}
        />
      </header>
      <div className="how">
        <article><span>Step 1</span><strong>Name the group</strong><p>Use the field above. The new collection opens on the right.</p></article>
        <article><span>Step 2</span><strong>Add products</strong><p>Search inside the open collection and press Add. A product can sit in more than one group.</p></article>
        <article><span>Step 3</span><strong>Write a note</strong><p>When the group has products, {ASSISTANT} can describe what is in it. You can remove the group later.</p></article>
      </div>
      {error && <ErrorNote text={error} />}
      {sets.length === 0 ? (
        <Empty title="No collections yet" text="Name one in the field above. Then search for products and add them." />
      ) : (
        <div className="collection-layout">
          <div className="collection-list">
            {sets.map((item) => (
              <button key={item.id} type="button" className={item.id === currentId ? "on" : ""} onClick={() => setCurrentId(item.id)}>
                <strong>{item.name}</strong>
                <span>{item.products.length} {item.products.length === 1 ? "product" : "products"}</span>
              </button>
            ))}
          </div>
          {current && (
            <div className="panel">
              <div className="actions">
                <h2 style={{ marginRight: "auto" }}>{current.name}</h2>
                <button type="button" className="btn" disabled={briefing || current.products.length === 0} onClick={() => void writeBrief()}>
                  {briefing ? "Writing…" : "Write a note"}
                </button>
                <button type="button" className="btn danger" onClick={() => void removeSet()}>Remove collection</button>
              </div>
              {current.brief && (
                <div className="draft-card">
                  <p className="kicker">{ASSISTANT}</p>
                  <p>{current.brief}</p>
                </div>
              )}
              <form className="actions" style={{ marginTop: 16 }} onSubmit={(event) => event.preventDefault()}>
                <input className="line-input" style={{ maxWidth: 360 }} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a product to add" />
              </form>
              {query.trim().length >= 2 && matches.length === 0 && <p className="lede">No product matches that name.</p>}
              {matches.map((product) => (
                <button key={product.id} type="button" className="pick" onClick={() => void addProduct(product)}>
                  <strong>{product.brand} {product.name}</strong>
                  <span>Add · {money(product.price, product.currency)}</span>
                </button>
              ))}
              {current.products.length === 0 ? (
                <p className="lede" style={{ marginTop: 16 }}>This collection is empty. Search above and add a product.</p>
              ) : (
                <div className="product-grid smart-results count-3" style={{ marginTop: 16 }}>
                  {current.products.map((product) => (
                    <article className="product-card" key={product.id}>
                      <Link to={`/products/${product.id}`}>
                        <figure>
                          <ImageTile src={product.image_url} name={product.name} category={product.category} />
                        </figure>
                      </Link>
                      <div className="body">
                        <p className="brand">{product.brand}</p>
                        <h3><Link to={`/products/${product.id}`}>{product.name}</Link></h3>
                        <p className="price">{money(product.price, product.currency)}</p>
                        <button type="button" className="btn ghost small" onClick={() => void removeProduct(product.id)}>Remove</button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
