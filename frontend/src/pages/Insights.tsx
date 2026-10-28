import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import { ErrorNote } from "../components/States";
import { money, useTitle, when } from "../format";
import type { Insights } from "../types";

export function InsightsPage() {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useTitle("Dashboard");

  function load() {
    setError("");
    return api<Insights>("/api/insights/health/")
      .then(setData)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "The dashboard did not load."));
  }

  useEffect(() => {
    void load();
  }, []);

  async function rescan() {
    setBusy(true);
    try {
      setData(await api<Insights>("/api/insights/rescan/", { method: "POST" }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The refresh did not finish.");
    } finally {
      setBusy(false);
    }
  }

  if (error && !data) return <ErrorNote text={error} onRetry={() => void load()} />;
  if (!data) return <p className="lede">Loading the dashboard…</p>;
  const max = Math.max(...data.by_category.map((item) => item.count), 1);

  return (
    <section>
      <header className="page-stage">
        <p className="kicker">Dashboard</p>
        <h1>See the health of the catalog.</h1>
        <p>
          This page counts what is listed, what is thin, what is priced far from its category, and what may be a duplicate.
          Updated {when(data.scanned_at)}. Open any number to see those products.
        </p>
        <div className="actions" style={{ marginTop: 18 }}>
          <button type="button" className="btn gold" onClick={() => void rescan()} disabled={busy}>
            {busy ? "Refreshing…" : "Refresh the counts"}
          </button>
          <Link className="btn ghost" to="/studio">Fix a short description</Link>
        </div>
      </header>
      {error && <ErrorNote text={error} />}
      <div className="how">
        <article><span>Listed</span><strong>What is on the shelf</strong><p>Active products you can search, save, and compare.</p></article>
        <article><span>Quality</span><strong>What still needs work</strong><p>Missing photos, short descriptions, and drafts are counted separately.</p></article>
        <article><span>Watch</span><strong>Prices and stock</strong><p>A price far from its category, or a product nearly out, shows up below.</p></article>
      </div>
      <div className="stats">
        <Link className="stat" to="/">
          <span>Listed products</span>
          <strong>{data.active}</strong>
          <small>Open the full catalog.</small>
        </Link>
        <div className="score-hero">
          <span>Listing quality</span>
          <strong>{data.avg_completeness}</strong>
          <small>Average of photo, description, price, and stock filled in.</small>
        </div>
        <Link className="stat" to="/?stock=low">
          <span>Low stock</span>
          <strong>{data.low_stock_count ?? 0}</strong>
          <small>Five or fewer left, including none left.</small>
        </Link>
        <Link className="stat" to="/?status=draft">
          <span>Drafts</span>
          <strong>{data.drafts}</strong>
          <small>Saved, but not shown in search.</small>
        </Link>
        <Link className="stat" to="/?needs=image">
          <span>Missing photo</span>
          <strong>{data.missing_image}</strong>
          <small>Listings with no image.</small>
        </Link>
        <Link className="stat" to="/?needs=story">
          <span>Short description</span>
          <strong>{data.thin}</strong>
          <small>Open AI Studio to rewrite one.</small>
        </Link>
      </div>
      <div className="dash-sections">
        <div className="panel">
          <h2>By category</h2>
          <p className="section-note">How many active products sit in each category. Click a bar to open that shelf.</p>
          <div className="bars">
            {data.by_category.map((item) => (
              <Link className="bar" key={item.name} to={`/?category=${encodeURIComponent(item.name)}`}>
                <span>{item.name}</span>
                <i><span style={{ width: `${(item.count / max) * 100}%` }} /></i>
                <span>{item.count}</span>
              </Link>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gap: 16 }}>
          <div className="panel">
            <h2>Price insights</h2>
            <p className="section-note">A price at least five times the category middle, or at most 15% of it, when that category has four or more products.</p>
            {data.price_outliers.length === 0 && <p>Prices sit close to their category.</p>}
            {data.price_outliers.map((item) => (
              <div className="outlier" key={item.id}>
                <Link to={`/products/${item.id}`}><strong>{item.brand} {item.name}</strong></Link>
                <p>{money(item.price)} · usual around {money(item.median)}</p>
                <p className="lede">{item.reason}</p>
              </div>
            ))}
          </div>
          <div className="panel">
            <h2>Possible duplicates</h2>
            <p className="section-note">Same brand, and the names are close enough that they may be the same product entered twice.</p>
            {data.near_duplicates.length === 0 && <p>No close name matches.</p>}
            {data.near_duplicates.map((pair) => (
              <div className="pair" key={`${pair.left.id}-${pair.right.id}`}>
                <p>
                  <Link to={`/products/${pair.left.id}`}>{pair.left.name}</Link>
                  {" and "}
                  <Link to={`/products/${pair.right.id}`}>{pair.right.name}</Link>
                </p>
                <p className="lede">{pair.left.brand} · {Math.round(pair.score * 100)}% similar · {money(pair.left.price)} and {money(pair.right.price)}</p>
              </div>
            ))}
          </div>
          <div className="panel">
            <h2>Running low</h2>
            <p className="section-note">Products with little or no stock. Open one to update the count.</p>
            {(data.low_stock ?? []).length === 0 && <p>Stock looks comfortable.</p>}
            {(data.low_stock ?? []).map((item) => (
              <div className="outlier" key={item.id}>
                <Link to={`/products/${item.id}`}><strong>{item.brand} {item.name}</strong></Link>
                <p className="lede">{item.stock === 0 ? "Out of stock" : `${item.stock} left`} · {money(item.price)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
