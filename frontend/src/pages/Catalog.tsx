import { FormEvent, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { ImageTile } from "../components/ImageTile";
import { Empty, ErrorNote } from "../components/States";
import { friendlyError, money, useTitle } from "../format";
import { InCatalog } from "../hints";
import { RecentStrip } from "../recent";
import { useHold } from "../hold";
import { useSaved } from "../saved";
import { useToast } from "../toast";
import type { Facets, Page, Product, SearchResponse } from "../types";

const PAGE_SIZE = 12;
const PRESETS = [
  { label: "Under ₹1,000", min: null, max: "1000" },
  { label: "₹1,000–5,000", min: "1000", max: "5000" },
  { label: "₹5,000–15,000", min: "5000", max: "15000" },
  { label: "Above ₹15,000", min: "15000", max: null },
];

export function CatalogPage() {
  const [params, setParams] = useSearchParams();
  const [pageData, setPageData] = useState<Page<Product> | null>(null);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [searchText, setSearchText] = useState(params.get("q") ?? "");
  const [note, setNote] = useState("");
  const hold = useHold();
  const saved = useSaved();
  const toast = useToast();
  useTitle("Products");

  const query = params.toString();

  useEffect(() => {
    function resetHome() {
      setSearchText("");
      setNote("");
      setParams(new URLSearchParams());
      setReloadKey((value) => value + 1);
    }
    window.addEventListener("catalogai-home", resetHome);
    return () => window.removeEventListener("catalogai-home", resetHome);
  }, [setParams]);

  const category = params.get("category") ?? "";
  const brand = params.get("brand") ?? "";

  useEffect(() => {
    const search = new URLSearchParams();
    if (category) search.set("category", category);
    if (brand) search.set("brand", brand);
    const suffix = search.toString();
    api<Facets>(`/api/products/facets/${suffix ? `?${suffix}` : ""}`)
      .then((data) => {
        setFacets(data);
        if (brand && !data.brands.some((item) => item.name === brand)) {
          update({ brand: null });
        }
      })
      .catch(() => setFacets(null));
  }, [reloadKey, category, brand]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setLoading(true);
    setError("");
    const search = new URLSearchParams(query);
    if (!search.get("page_size")) search.set("page_size", String(PAGE_SIZE));
    api<Page<Product>>(`/api/products/?${search.toString()}`, { signal: controller.signal })
      .then((data) => {
        if (!cancelled) setPageData(data);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof ApiError ? err.message : "The catalog did not load.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [query, reloadKey]);

  function update(next: Record<string, string | null>, keepPage = false) {
    const copy = new URLSearchParams(params);
    Object.entries(next).forEach(([key, value]) => {
      if (!value) copy.delete(key);
      else copy.set(key, value);
    });
    if (!keepPage) copy.delete("page");
    setParams(copy);
  }

  async function runQuery(text: string) {
    if (text.split(/\s+/).length < 3 && !/(under|above|below|between|cheap|premium|₹|rs)/i.test(text)) {
      setNote("");
      update({ q: text || null });
      return;
    }
    try {
      const data = await api<SearchResponse>("/api/ai/search/", {
        method: "POST",
        body: JSON.stringify({ query: text }),
      });
      const sort = data.interpretation.sort;
      const ordering = sort === "price_asc" ? "price" : sort === "price_desc" ? "-price" : null;
      setNote(data.answer);
      update({
        q: data.interpretation.keywords || null,
        brand: data.interpretation.brand,
        category: data.interpretation.category,
        min_price: data.interpretation.min_price != null ? String(data.interpretation.min_price) : null,
        max_price: data.interpretation.max_price != null ? String(data.interpretation.max_price) : null,
        ordering,
      });
    } catch (err) {
      setNote("");
      update({ q: text });
      toast(friendlyError(err, "Search used the product name instead."), "bad");
    }
  }

  function onSearch(event: FormEvent) {
    event.preventDefault();
    void runQuery(searchText.trim());
  }

  async function onImport(file: File) {
    const body = new FormData();
    body.append("file", file);
    try {
      const result = await api<{ created: number; updated: number; errors: { row: number; detail: string }[] }>(
        "/api/products/import/",
        { method: "POST", body },
      );
      toast(`Imported ${result.created} new and updated ${result.updated}.`);
      if (result.errors.length) toast(result.errors[0].detail, "bad");
      setReloadKey((value) => value + 1);
    } catch (err) {
      toast(friendlyError(err, "The file could not be read."), "bad");
    }
  }

  const page = Number(params.get("page") || 1);
  const filtered = Boolean(
    params.get("q") || params.get("category") || params.get("brand") || params.get("needs") || params.get("stock") || params.get("min_price") || params.get("max_price"),
  );

  return (
    <section>
      {!filtered && (
        <header className="home-hero">
          <p className="kicker">CatalogAI</p>
          <h1>Start with one job.</h1>
          <p>Pick a path. The shelf is underneath when you want to browse by category.</p>
          <div className="home-paths">
            <Link to="/ask">
              <span><i className="ai-pill">AI</i> Smart Search</span>
              <strong>Search in a sentence</strong>
              <p>Cheapest tea, Nike jackets, running shoes under ₹9,000.</p>
            </Link>
            <Link to="/assistant">
              <span><i className="ai-pill">AI</i> Catalog Assistant</span>
              <strong>Ask what is listed</strong>
              <p>A greeting, today’s date, or which of two products is cheaper.</p>
            </Link>
            <Link to="/studio">
              <span><i className="ai-pill">AI</i> AI Studio</span>
              <strong>Rewrite a thin listing</strong>
              <p>A stronger title, description, and tags. You save it onto the product.</p>
            </Link>
          </div>
        </header>
      )}
      {!filtered && (
        <form className="home-search" onSubmit={onSearch}>
          <input
            value={searchText}
            placeholder="Search by name, or describe it"
            onChange={(event) => setSearchText(event.target.value)}
            aria-label="Search"
          />
          <button className="btn gold" type="submit">Search</button>
        </form>
      )}
      {!filtered && (
        <div className="chips home-cats">
          {facets?.categories.map((item) => (
            <button key={item.name} type="button" className="chip" onClick={() => update({ category: item.name })}>
              {item.name}
            </button>
          ))}
        </div>
      )}
      {filtered && (
      <header className="page-head">
        <div>
          <p className="kicker">Products</p>
          <h1>Products</h1>
          <p className="lede">Search by name, or describe what you want. Filters stay on until you clear them.</p>
        </div>
        <div className="actions">
          <label className="btn ghost" title="Add many products from a spreadsheet. The file needs name, brand, category, and price.">
            Import CSV
            <input
              type="file"
              accept=".csv,text/csv"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onImport(file);
                event.target.value = "";
              }}
            />
          </label>
          <Link className="btn" to="/products/new">Add product</Link>
        </div>
      </header>
      )}
      {filtered && <RecentStrip />}

      {filtered && <form className="filters" onSubmit={onSearch}>
        <label>
          Search
          <input
            className="line-input"
            value={searchText}
            placeholder="Black running shoes under 9000"
            onChange={(event) => setSearchText(event.target.value)}
          />
        </label>
        <label>
          Category
          <select value={params.get("category") ?? ""} onChange={(event) => update({ category: event.target.value || null })}>
            <option value="">All</option>
            {facets?.categories.map((item) => (
              <option key={item.name} value={item.name}>{item.name} ({item.count})</option>
            ))}
          </select>
        </label>
        <label>
          Brand
          <select value={params.get("brand") ?? ""} onChange={(event) => update({ brand: event.target.value || null })}>
            <option value="">All</option>
            {facets?.brands.map((item) => (
              <option key={item.name} value={item.name}>{item.name}</option>
            ))}
          </select>
        </label>
        <label>
          Sort
          <select value={params.get("ordering") ?? ""} onChange={(event) => update({ ordering: event.target.value || null })}>
            <option value="">Newest</option>
            <option value="price">Price, low to high</option>
            <option value="-price">Price, high to low</option>
            <option value="name">Name</option>
          </select>
        </label>
        <label>
          Availability
          <select
            value={params.get("stock") || params.get("status") || "active"}
            onChange={(event) => {
              const value = event.target.value;
              if (value === "low" || value === "out") update({ stock: value, status: null });
              else update({ stock: null, status: value === "active" ? null : value });
            }}
          >
            <option value="active">In catalog</option>
            <option value="low">Low stock</option>
            <option value="out">Out of stock</option>
            <option value="draft">Drafts</option>
            <option value="all">Everything</option>
          </select>
        </label>
      </form>}

      {filtered && <InCatalog
        compact={!filtered}
        title="Try something that is listed"
        note="Tea, Nike, watches, headphones, and grocery are in this catalog. A random product name is not."
        onQuery={(text) => {
          setSearchText(text);
          void runQuery(text);
        }}
      />}

      {filtered && <div className="chips">
        {facets?.categories.map((item) => (
          <button
            key={item.name}
            type="button"
            className={params.get("category") === item.name ? "chip on" : "chip"}
            onClick={() => update({ category: params.get("category") === item.name ? null : item.name })}
          >
            {item.name}
          </button>
        ))}
        {PRESETS.map((preset) => {
          const on = (params.get("min_price") ?? "") === (preset.min ?? "") && (params.get("max_price") ?? "") === (preset.max ?? "");
          return (
            <button
              key={preset.label}
              type="button"
              className={on ? "chip on" : "chip"}
              onClick={() => update({ min_price: on ? null : preset.min, max_price: on ? null : preset.max })}
            >
              {preset.label}
            </button>
          );
        })}
      </div>}

      {!filtered && (
        <div className="shelf-bar">
          <span><strong>{pageData?.count ?? "—"}</strong> products on the shelf</span>
          <div className="actions">
            <label className="btn ghost" title="Add many products from a spreadsheet. The file needs name, brand, category, and price.">
              Import CSV
              <input
                type="file"
                accept=".csv,text/csv"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onImport(file);
                  event.target.value = "";
                }}
              />
            </label>
            <Link className="btn" to="/products/new">Add product</Link>
          </div>
        </div>
      )}
      {!filtered && <RecentStrip />}

      {filtered && <div className="meta-row">
        <span><strong>{pageData?.count ?? "—"}</strong> products{note ? ` · ${note}` : ""}</span>
        {filtered && (
          <button
            type="button"
            className="btn ghost small"
            onClick={() => {
              setSearchText("");
              setNote("");
              setParams(new URLSearchParams());
            }}
          >
            Clear filters
          </button>
        )}
      </div>}

      {error && <ErrorNote text={error} onRetry={() => setReloadKey((value) => value + 1)} />}
      {loading && !pageData && <p className="lede">Loading products…</p>}
      {pageData && pageData.results.length === 0 && (
        <Empty title="That is not in this catalog" text="Use a category, a brand, or one of the suggestions above. A random product name will not match." />
      )}

      {pageData && pageData.results.length > 0 && (
        <>
          <div className="product-grid" aria-busy={loading}>
            {pageData.results.map((product) => (
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
                  <span className={product.stock === 0 ? "badge out" : product.stock <= 5 ? "badge warn" : "badge"}>
                    {product.stock === 0 ? "Out of stock" : product.stock <= 5 ? `${product.stock} left` : `${product.stock} in stock`}
                  </span>
                  <div className="card-actions">
                    <button type="button" className="btn ghost small" onClick={() => saved.toggle(product)}>
                      {saved.has(product.id) ? "Saved" : "Save"}
                    </button>
                    <button
                      type="button"
                      className="btn ghost small"
                      onClick={() => {
                        const ok = hold.toggle(product);
                        if (!ok) toast("Compare holds up to three products.", "bad");
                      }}
                    >
                      {hold.has(product.id) ? "Comparing" : "Compare"}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {pageData.pages > 1 && (
            <div className="pager">
              <button type="button" className="btn ghost small" disabled={page <= 1} onClick={() => update({ page: String(page - 1) }, true)}>
                Previous
              </button>
              <span>{page} of {pageData.pages}</span>
              <button type="button" className="btn ghost small" disabled={page >= pageData.pages} onClick={() => update({ page: String(page + 1) }, true)}>
                Next
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
