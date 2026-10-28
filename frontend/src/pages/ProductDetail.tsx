import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { ImageTile } from "../components/ImageTile";
import { ErrorNote } from "../components/States";
import { ASSISTANT, friendlyError, money, useTitle, when } from "../format";
import { rememberProduct } from "../recent";
import { useHold } from "../hold";
import { useToast } from "../toast";
import type { Page, Product } from "../types";

const ASSISTS = [
  { id: "explain", name: "Explain AI", line: "Say what this listing is" },
  { id: "audience", name: "Audience AI", line: "Who this product is for" },
  { id: "rewrite", name: "Rewrite AI", line: "Write a stronger description" },
  { id: "questions", name: "Questions AI", line: "Questions worth asking next" },
  { id: "compare", name: "Compare AI", line: "Set it beside similar listings" },
] as const;

type Assist = { task: string; text: string; points: string[]; provider: string };

export function ProductDetailPage() {
  const { id } = useParams();
  const [product, setProduct] = useState<Product | null>(null);
  const [related, setRelated] = useState<Product[]>([]);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [assist, setAssist] = useState<Assist | null>(null);
  const [assistTask, setAssistTask] = useState("");
  const [assistError, setAssistError] = useState("");
  const navigate = useNavigate();
  const toast = useToast();
  const hold = useHold();
  useTitle(product ? product.name : "Style");

  useEffect(() => {
    if (!id) return;
    let current = true;
    setError("");
    setProduct(null);
    setRelated([]);
    setAssist(null);
    setAssistError("");
    setConfirming(false);
    window.scrollTo(0, 0);
    api<Product>(`/api/products/${id}/`)
      .then((item) => {
        if (!current) return null;
        setProduct(item);
        rememberProduct({
          id: item.id,
          name: item.name,
          brand: item.brand,
          price: item.price,
          currency: item.currency,
        });
        return api<Page<Product>>(`/api/products/?category=${encodeURIComponent(item.category)}&ordering=name&page_size=24`);
      })
      .then((page) => {
        if (!current || !page) return;
        setRelated(page.results.filter((item) => String(item.id) !== id).slice(0, 3));
      })
      .catch((err: unknown) => {
        if (!current) return;
        setError(err instanceof ApiError ? err.message : "This style could not be opened.");
      });
    return () => {
      current = false;
    };
  }, [id]);

  async function askAssist(task: string) {
    if (!product) return;
    setAssistTask(task);
    setAssistError("");
    try {
      setAssist(await api<Assist>(`/api/ai/products/${product.id}/`, {
        method: "POST",
        body: JSON.stringify({ task }),
      }));
    } catch (err) {
      setAssist(null);
      setAssistError(friendlyError(err, "Catalog Assistant AI could not write that just now."));
    } finally {
      setAssistTask("");
    }
  }

  async function keepRewrite() {
    if (!product || !assist || assist.task !== "rewrite") return;
    const saved = await api<Product>(`/api/products/${product.id}/`, {
      method: "PATCH",
      body: JSON.stringify({
        name: product.name,
        brand: product.brand,
        category: product.category,
        description: assist.text,
        price: product.price,
        currency: product.currency,
        image_url: product.image_url,
        stock: product.stock,
        status: product.status,
        tags: assist.points.length ? assist.points : product.tags,
        attributes: product.attributes,
      }),
    });
    setProduct(saved);
    toast("The description now uses the generated draft.");
  }

  async function remove() {
    if (!product) return;
    await api(`/api/products/${product.id}/`, { method: "DELETE" });
    hold.remove(product.id);
    toast(`Removed ${product.sku}.`);
    navigate("/");
  }

  if (error) return <ErrorNote text={error} />;
  if (!product) return <p className="lede">Opening the product…</p>;

  return (
    <article>
      <p className="kicker">{product.category}</p>
      <div className="detail">
        <figure>
          <ImageTile src={product.image_url} name={product.name} category={product.category} eager />
        </figure>
        <div>
          <p className="brand" style={{ letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--muted)" }}>
            {product.brand}
          </p>
          <h1>{product.name}</h1>
          <p className="price-lg">{money(product.price, product.currency)}</p>
          <p>{product.description || "No description yet."}</p>
          <dl className="facts">
            <div>
              <dt>SKU</dt>
              <dd>{product.sku}</dd>
            </div>
            <div>
              <dt>On hand</dt>
              <dd>{product.stock}</dd>
            </div>
            <div>
              <dt>Listing quality</dt>
              <dd>{product.completeness}</dd>
            </div>
            <div>
              <dt>State</dt>
              <dd>{product.status}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{when(product.updated_at)}</dd>
            </div>
            <div>
              <dt>Added by</dt>
              <dd>{product.created_by || "—"}</dd>
            </div>
            {Object.entries(product.attributes).map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <div className="tags">
            {product.tags.map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </div>
          <div className="actions">
            <Link className="btn" to={`/products/${product.id}/edit`}>
              Edit
            </Link>
            <Link className="btn ghost" to={`/ask?q=${encodeURIComponent(product.name)}`}>
              Find neighbours
            </Link>
            {!confirming ? (
              <button type="button" className="btn danger" onClick={() => setConfirming(true)}>
                Remove
              </button>
            ) : (
              <button type="button" className="btn danger" onClick={() => void remove()}>
                Confirm remove
              </button>
            )}
          </div>
        </div>
      </div>
      <section className="ai-board">
            <p className="kicker"><i className="ai-pill">AI</i> Features</p>
            <h2>Use AI on this product</h2>
            <div className="feat-grid">
              {ASSISTS.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  className={assistTask === action.id ? "feat on" : "feat"}
                  disabled={assistTask !== ""}
                  onClick={() => void askAssist(action.id)}
                >
                  <b><i>AI</i> {action.name}</b>
                  <strong>{assistTask === action.id ? "Writing…" : action.line}</strong>
                </button>
              ))}
              <Link className="feat" to="/assistant">
                <b><i>AI</i> Catalog Assistant</b>
                <strong>Ask about what is listed</strong>
              </Link>
              <Link className="feat" to="/studio">
                <b><i>AI</i> AI Studio</b>
                <strong>Rewrite the listing, then save</strong>
              </Link>
              <Link className="feat" to={`/ask?q=${encodeURIComponent(product.name)}`}>
                <b><i>AI</i> Smart Search</b>
                <strong>Find this in a sentence</strong>
              </Link>
              <Link className="feat" to="/compare">
                <b><i>AI</i> Compare</b>
                <strong>Hold it next to another product</strong>
              </Link>
            </div>
            {assistError && <p className="alert">{assistError}</p>}
            {assist && (
              <div className="draft">
                <p>{assist.text}</p>
                {assist.points.length > 0 && (
                  <ul>
                    {assist.points.map((point) => <li key={point}>{point}</li>)}
                  </ul>
                )}
                {assist.task === "rewrite" && (
                  <button type="button" className="btn" onClick={() => void keepRewrite()}>
                    Save this description
                  </button>
                )}
                <p className="signed">{ASSISTANT}</p>
              </div>
            )}
      </section>
      {related.length > 0 && (
        <div className="related-row">
          <p className="kicker">More in {product.category}</p>
          <div>
            {related.map((item) => (
              <Link key={item.id} to={`/products/${item.id}`}>
                {item.brand} {item.name}
                <span>{money(item.price, item.currency)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
