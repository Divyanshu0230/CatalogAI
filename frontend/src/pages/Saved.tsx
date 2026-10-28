import { Link } from "react-router-dom";
import { ImageTile } from "../components/ImageTile";
import { money, useTitle } from "../format";
import { InCatalog } from "../hints";
import { useHold } from "../hold";
import { useSaved } from "../saved";
import { useToast } from "../toast";

export function SavedPage() {
  const saved = useSaved();
  const hold = useHold();
  const toast = useToast();
  useTitle("Saved");

  return (
    <section>
      <header className="page-stage">
        <p className="kicker">Saved</p>
        <h1>{saved.items.length === 0 ? "Keep products you want to come back to." : `${saved.items.length} saved on this browser.`}</h1>
        <p>
          Save is a personal list on this browser. It is not a collection, and it is not shared with other people. Use it when you want a product waiting the next time you open CatalogAI here.
        </p>
        <div className="actions" style={{ marginTop: 18 }}>
          <Link className="btn gold" to="/">Browse products</Link>
          <Link className="btn ghost" to="/compare">Open compare</Link>
        </div>
      </header>
      <div className="how">
        <article><span>Step 1</span><strong>Press Save</strong><p>On a product card, in Smart Search, or on the product page.</p></article>
        <article><span>Step 2</span><strong>Come back here</strong><p>The list stays in this browser until you remove an item.</p></article>
        <article><span>Step 3</span><strong>Compare or open</strong><p>Add a saved product to Compare, or open it to see the full listing.</p></article>
      </div>
      {saved.items.length === 0 ? (
        <div className="panel">
          <h2>Nothing saved yet</h2>
          <p className="section-note">Open Products, choose something you might want later, and press Save. It will show up here.</p>
          <Link className="btn" to="/">Go to products</Link>
          <div style={{ marginTop: 16 }}>
            <InCatalog title="Save one of these" note="Open a listed product and press Save." />
          </div>
        </div>
      ) : (
        <div className={`product-grid smart-results count-${Math.min(saved.items.length, 4)}`}>
          {saved.items.map((product) => (
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
                  <button type="button" className="btn ghost small" onClick={() => saved.remove(product.id)}>Remove</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
