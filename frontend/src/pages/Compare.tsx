import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, ApiError } from "../api";
import { ImageTile } from "../components/ImageTile";
import { ErrorNote } from "../components/States";
import { money, useTitle } from "../format";
import { findListed, InCatalog } from "../hints";
import { useHold } from "../hold";
import { useToast } from "../toast";
import type { Collection, Product } from "../types";

function PriceNote({ products }: { products: Product[] }) {
  const ranked = [...products].sort((a, b) => Number(a.price) - Number(b.price));
  const low = ranked[0];
  const high = ranked[ranked.length - 1];
  if (!low || !high || low.id === high.id) return null;
  const gap = Number(high.price) - Number(low.price);
  return (
    <article className="smart-answer">
      <div>
        <p className="kicker">Price gap</p>
        <h2>{high.brand} {high.name} is {money(gap, high.currency)} more than {low.brand} {low.name}.</h2>
        <p className="signed">Catalog Assistant AI</p>
      </div>
      <div className="smart-stats">
        <div><span>Lowest</span><strong>{money(low.price, low.currency)}</strong></div>
        <div><span>Highest</span><strong>{money(high.price, high.currency)}</strong></div>
        <div><span>Compared</span><strong>{products.length}</strong></div>
      </div>
    </article>
  );
}

export function ComparePage() {
  const hold = useHold();
  const [products, setProducts] = useState<Product[]>([]);
  const [missing, setMissing] = useState<number[]>([]);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<Product[]>([]);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const toast = useToast();
  const navigate = useNavigate();
  useTitle("Compare");
  const ids = hold.items.map((item) => item.id).join(",");

  useEffect(() => {
    if (!ids) {
      setProducts([]);
      setMissing([]);
      return;
    }
    api<{ results: Product[]; missing: number[] }>(`/api/products/compare/?ids=${ids}`)
      .then((data) => {
        setProducts(data.results);
        setMissing(data.missing);
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "The compare list could not be loaded."));
  }, [ids]);

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

  function add(product: Product) {
    const already = hold.has(product.id);
    const ok = hold.toggle(product);
    if (!ok) {
      toast("Compare holds up to three products.", "bad");
      return;
    }
    if (!already) {
      setQuery("");
      setMatches([]);
      toast(`Added ${product.name}.`);
    }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    try {
      const collection = await api<Collection>("/api/collections/", {
        method: "POST",
        body: JSON.stringify({ name, product_ids: products.map((item) => item.id) }),
      });
      toast(`Saved the collection “${collection.name}”.`);
      navigate("/collections");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The collection could not be saved.");
    }
  }

  const lowest = products.reduce<Product | null>((best, product) => {
    if (!best || Number(product.price) < Number(best.price)) return product;
    return best;
  }, null);
  const openSlots = Math.max(0, 3 - products.length);

  return (
    <section>
      <header className="page-stage">
        <p className="kicker">Compare</p>
        <h1>Put up to three products side by side.</h1>
        <p>
          Search here and add a product. Prices, stock, and descriptions stay the ones stored on each listing. The lowest price is marked in gold.
        </p>
        <form className="smart-bar" onSubmit={(event) => event.preventDefault()}>
          <label className="sr-only" htmlFor="compare-query">Add a product</label>
          <input id="compare-query" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search a product to add, for example running shoes" />
          <button className="btn gold" type="submit">Search</button>
        </form>
        <InCatalog
          compact
          title="Add something listed"
          note="Search one of these. A product that is not in the catalog cannot be compared."
          onQuery={setQuery}
          onProduct={(id) => {
            void api<Product>(`/api/products/${id}/`).then(add).catch(() => setError("That product did not open."));
          }}
        />
      </header>
      <div className="how">
        <article><span>Step 1</span><strong>Search on this page</strong><p>Type a name or a brand. You do not have to leave Compare.</p></article>
        <article><span>Step 2</span><strong>Add up to three</strong><p>Each result has an Add button. A fourth product will not fit until you remove one.</p></article>
        <article><span>Step 3</span><strong>Read the gap</strong><p>The price difference is calculated from the stored prices. Save the three as a collection if you want to keep the group.</p></article>
      </div>
      {error && <ErrorNote text={error} />}
      {matches.length > 0 && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <h2>Add from search</h2>
          {matches.map((product) => (
            <button key={product.id} type="button" className="pick" onClick={() => add(product)}>
              <strong>{product.brand} {product.name}</strong>
              <span>{hold.has(product.id) ? "Remove" : "Add"} · {money(product.price, product.currency)}</span>
            </button>
          ))}
        </div>
      )}
      {products.length >= 2 && <PriceNote products={products} />}
      {missing.length > 0 && <p className="lede">Some compared products are no longer in the catalog.</p>}
      <div className="compare-board">
        {products.map((product) => (
          <article className="product-card" key={product.id}>
            <Link to={`/products/${product.id}`}>
              <figure>
                <ImageTile src={product.image_url} name={product.name} category={product.category} />
              </figure>
            </Link>
            <div className="body">
              <p className="brand">{product.brand}</p>
              <h3><Link to={`/products/${product.id}`}>{product.name}</Link></h3>
              <p className="price-lg">{money(product.price, product.currency)}</p>
              {lowest?.id === product.id && products.length > 1 && <span className="badge lowest">Lowest price</span>}
              <p className="lede">{product.category} · {product.stock === 0 ? "Out of stock" : `${product.stock} in stock`}</p>
              <p>{product.description || "No description yet."}</p>
              <button type="button" className="btn ghost small" onClick={() => hold.remove(product.id)}>Remove</button>
            </div>
          </article>
        ))}
        {Array.from({ length: openSlots }, (_, index) => (
          <div className="compare-slot" key={`slot-${index}`}>
            <div>
              <strong>Open seat {products.length + index + 1} of 3</strong>
              Search above and add a product.
            </div>
          </div>
        ))}
      </div>
      {products.length >= 2 && (
        <form className="actions" style={{ marginTop: 18 }} onSubmit={save}>
          <input className="line-input" style={{ maxWidth: 280 }} placeholder="Name this as a collection" value={name} onChange={(event) => setName(event.target.value)} required />
          <button className="btn" type="submit">Save as a collection</button>
          <button type="button" className="btn ghost" onClick={hold.clear}>Clear all</button>
        </form>
      )}
      {products.length > 0 && products.length < 2 && (
        <div className="actions" style={{ marginTop: 18 }}>
          <button type="button" className="btn ghost" onClick={hold.clear}>Clear</button>
        </div>
      )}
    </section>
  );
}
