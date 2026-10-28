import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api } from "../api";
import { ImageTile } from "../components/ImageTile";
import { Empty, ErrorNote } from "../components/States";
import { ASSISTANT, friendlyError, money, useTitle } from "../format";
import { InCatalog } from "../hints";
import { useHold } from "../hold";
import { useSaved } from "../saved";
import { useToast } from "../toast";
import type { Product, Reading, SearchResponse } from "../types";

const PROMPTS = [
  { label: "Budget", text: "black running shoes under ₹9,000" },
  { label: "Cheapest", text: "cheapest tea" },
  { label: "Premium", text: "premium watches above ₹50,000" },
  { label: "Audio", text: "headphones under ₹5,000" },
  { label: "Occasion", text: "something for a monsoon commute" },
  { label: "Brand", text: "Nike jackets" },
];
const RECENT_KEY = "catalogai.recent";

function readRecent() {
  try {
    const parsed = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]") as string[];
    return Array.isArray(parsed) ? parsed.slice(0, 6) : [];
  } catch {
    return [];
  }
}

function catalogHref(reading: Reading) {
  const search = new URLSearchParams();
  if (reading.keywords) search.set("q", reading.keywords);
  if (reading.brand) search.set("brand", reading.brand);
  if (reading.category) search.set("category", reading.category);
  if (reading.min_price != null) search.set("min_price", String(reading.min_price));
  if (reading.max_price != null) search.set("max_price", String(reading.max_price));
  if (reading.sort === "price_asc") search.set("ordering", "price");
  if (reading.sort === "price_desc") search.set("ordering", "-price");
  const query = search.toString();
  return query ? `/?${query}` : "/";
}

export function AskPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get("q") ?? "");
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [recent, setRecent] = useState<string[]>(readRecent);
  const [order, setOrder] = useState<"match" | "low" | "high">("match");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const saved = useSaved();
  const hold = useHold();
  const toast = useToast();
  useTitle("Smart Search");

  async function ask(text: string) {
    const cleaned = text.trim();
    if (cleaned.length < 2) return;
    setBusy(true);
    setError("");
    setOrder("match");
    setParams({ q: cleaned });
    try {
      const data = await api<SearchResponse>("/api/ai/search/", {
        method: "POST",
        body: JSON.stringify({ query: cleaned }),
      });
      setResult(data);
      const next = [cleaned, ...recent.filter((item) => item !== cleaned)].slice(0, 6);
      setRecent(next);
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch (err) {
      setError(friendlyError(err, "That search did not go through."));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const initial = params.get("q");
    if (initial) void ask(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(query);
  }

  const reading = result?.interpretation;
  const products = useMemo(() => {
    const list = result?.products ?? [];
    if (order === "match") return list;
    return [...list].sort((a, b) => {
      const gap = Number(a.price) - Number(b.price);
      return order === "low" ? gap : -gap;
    });
  }, [result, order]);
  const prices = products.map((product) => Number(product.price)).filter((value) => Number.isFinite(value));
  const low = prices.length ? Math.min(...prices) : null;
  const high = prices.length ? Math.max(...prices) : null;

  return (
    <section className="smart">
      <div className="smart-stage">
        <p className="kicker"><i className="ai-pill">AI</i> Smart Search</p>
        <h1>Say what you want. The catalog finds it.</h1>
        <p>Use a brand, a budget, or a normal sentence. {ASSISTANT} matches it to products that are actually listed.</p>
        <form className="smart-bar" onSubmit={onSubmit}>
          <label className="sr-only" htmlFor="smart-query">Search the catalog</label>
          <input
            id="smart-query"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Black running shoes under 9000"
          />
          <button className="btn gold" type="submit" disabled={busy}>{busy ? "Searching…" : "Search"}</button>
        </form>
        <InCatalog
          compact
          title="Listed searches"
          note="These match products in the catalog. A random name will not."
          onQuery={(text) => {
            setQuery(text);
            void ask(text);
          }}
        />
      </div>

      <div className="prompt-board">
        {PROMPTS.map((prompt) => (
          <button
            key={prompt.text}
            type="button"
            className={query === prompt.text ? "prompt-card on" : "prompt-card"}
            onClick={() => {
              setQuery(prompt.text);
              void ask(prompt.text);
            }}
          >
            <span>{prompt.label}</span>
            <strong>{prompt.text}</strong>
          </button>
        ))}
      </div>

      {recent.length > 0 && (
        <div className="smart-recent">
          <span>Recent</span>
          {recent.map((item) => (
            <button key={item} type="button" onClick={() => { setQuery(item); void ask(item); }}>
              {item}
            </button>
          ))}
        </div>
      )}

      {error && <ErrorNote text={error} />}

      {busy && !result && (
        <div className="product-grid" aria-hidden="true">
          {Array.from({ length: 6 }, (_, index) => <div className="smart-skel" key={index} />)}
        </div>
      )}

      {result && reading && (
        <>
          <article className="smart-answer">
            <div>
              <p className="kicker">From the catalog</p>
              <h2>{result.answer}</h2>
              <p className="signed">{ASSISTANT}</p>
            </div>
            <div className="smart-stats">
              <div><span>Matches</span><strong>{result.products.length}</strong></div>
              <div><span>Lowest</span><strong>{low == null ? "—" : money(low)}</strong></div>
              <div><span>Highest</span><strong>{high == null ? "—" : money(high)}</strong></div>
            </div>
          </article>

          <div className="smart-tools">
            <div className="chips">
              {reading.brand && <span className="chip on">{reading.brand}</span>}
              {reading.category && <span className="chip on">{reading.category}</span>}
              {reading.max_price != null && <span className="chip on">Up to {money(reading.max_price)}</span>}
              {reading.min_price != null && <span className="chip on">From {money(reading.min_price)}</span>}
              {reading.keywords && <span className="chip on">{reading.keywords}</span>}
            </div>
            <div className="actions">
              <button type="button" className={order === "match" ? "chip on" : "chip"} onClick={() => setOrder("match")}>Best match</button>
              <button type="button" className={order === "low" ? "chip on" : "chip"} onClick={() => setOrder("low")}>Lowest price</button>
              <button type="button" className={order === "high" ? "chip on" : "chip"} onClick={() => setOrder("high")}>Highest price</button>
              <Link className="btn small" to={catalogHref(reading)}>Open in Products</Link>
            </div>
          </div>

          {products.length === 0 ? (
            <Empty title="That is not in this catalog" text="Pick a listed search above, or open a category such as Grocery, Footwear, or Watches." />
          ) : (
            <div className={`product-grid smart-results count-${Math.min(products.length, 4)}`}>
              {products.map((product) => (
                <ProductHit
                  key={product.id}
                  product={product}
                  saved={saved.has(product.id)}
                  held={hold.has(product.id)}
                  onSave={() => saved.toggle(product)}
                  onHold={() => {
                    const ok = hold.toggle(product);
                    if (!ok) toast("Compare holds up to three products.", "bad");
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function ProductHit({
  product,
  saved,
  held,
  onSave,
  onHold,
}: {
  product: Product;
  saved: boolean;
  held: boolean;
  onSave: () => void;
  onHold: () => void;
}) {
  return (
    <article className="product-card">
      <Link to={`/products/${product.id}`}>
        <figure>
          <ImageTile src={product.image_url} name={product.name} category={product.category} />
        </figure>
      </Link>
      <div className="body">
        <p className="brand">{product.brand}</p>
        <h3><Link to={`/products/${product.id}`}>{product.name}</Link></h3>
        <p className="price">{money(product.price, product.currency)}</p>
        <span className={product.stock === 0 ? "badge out" : product.stock <= 5 ? "badge warn" : "badge"}>
          {product.stock === 0 ? "Out of stock" : product.stock <= 5 ? `${product.stock} left` : `${product.stock} in stock`}
        </span>
        <div className="card-actions">
          <button type="button" className="btn ghost small" onClick={onSave}>{saved ? "Saved" : "Save"}</button>
          <button type="button" className="btn ghost small" onClick={onHold}>{held ? "Comparing" : "Compare"}</button>
        </div>
      </div>
    </article>
  );
}
