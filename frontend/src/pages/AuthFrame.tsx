import type { ReactNode } from "react";
import { ThemeToggle } from "../theme";

const GEMS = [
  {
    label: "AI · Smart Search",
    title: "A sentence finds the product",
    text: "Try “cheapest tea”, “Nike jackets”, or “running shoes under ₹9,000”. The matches are products that are actually listed.",
  },
  {
    label: "AI Studio",
    title: "A thin listing gets real copy",
    text: "Pick a product with a short description. Catalog Assistant AI drafts the shelf copy, and you save it onto that product.",
  },
  {
    label: "Catalog Assistant AI",
    title: "Ask, then compare the price",
    text: "Say hello, ask the date, or which of two products is cheaper. The answer stays on the catalog, not on a made-up item.",
  },
];

export function AuthFrame({
  title,
  lede,
  children,
  alternate,
}: {
  title: string;
  lede: string;
  children: ReactNode;
  alternate: ReactNode;
}) {
  return (
    <div className="auth">
      <section className="auth-story">
        <div>
          <p className="kicker">CatalogAI</p>
          <h1>Sign in. The AI is already on the shelf.</h1>
          <p>Smart Search, AI Studio, and Catalog Assistant AI work on the products in this catalog. Open a demo desk and try one.</p>
        </div>
        <div className="auth-points">
          {GEMS.map((gem, index) => (
            <article key={gem.label}>
              <span>0{index + 1} · {gem.label}</span>
              <strong>{gem.title}</strong>
              <p>{gem.text}</p>
            </article>
          ))}
        </div>
      </section>
      <section className="auth-panel">
        <ThemeToggle />
        <div className="auth-card">
          <p className="kicker">CatalogAI</p>
          <h2>{title}</h2>
          <p className="lede">{lede}</p>
          {children}
          <p className="auth-alt">{alternate}</p>
        </div>
      </section>
    </div>
  );
}
