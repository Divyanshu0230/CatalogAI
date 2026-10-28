import { useTitle } from "../format";

const NEXT = [
  { name: "Photo Match AI", text: "A photo of a product finds the listing on this shelf that looks like it." },
  { name: "Voice Shelf AI", text: "Say “Nike jackets under 8000” and the catalog answers without a keyboard." },
  { name: "Bundle Composer AI", text: "Pick one product. It proposes two more that complete the same purchase." },
  { name: "Restock Planner AI", text: "Low stock is ranked by how soon that item would empty the shelf." },
  { name: "Hindi Copy AI", text: "One listing becomes shelf copy in Hindi, still from the facts already saved." },
  { name: "Price Coach AI", text: "A price suggested from the rest of that category. Nothing changes until you accept it." },
  { name: "Trend Watch AI", text: "Which categories are going quiet, and which ones filled up this week." },
  { name: "Review Reader AI", text: "A customer note becomes facts you can attach to the product, not a new product." },
];

export function FuturePage() {
  useTitle("Future scope");
  return (
    <section>
      <header className="page-stage">
        <p className="kicker">Future scope</p>
        <h1>What CatalogAI takes on next.</h1>
        <p>These are not on the desk yet. Each one stays tied to products that are already saved.</p>
      </header>
      <div className="future-board">
        {NEXT.map((item) => (
          <article key={item.name}>
            <span className="ai-pill">AI</span>
            <strong>{item.name}</strong>
            <p>{item.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
