import { Link } from "react-router-dom";
import { useTitle } from "../format";

export function AboutPage() {
  useTitle("About us");
  return (
    <section>
      <header className="page-stage">
        <p className="kicker">About us</p>
        <h1>A shared catalog you can search, compare, and ask.</h1>
        <p>
          CatalogAI is the buying desk for this assortment. Products, prices, and stock live in one catalog. Catalog Assistant AI writes and answers only from those listings.
        </p>
      </header>
      <div className="how">
        <article>
          <span>The catalog</span>
          <strong>What is listed</strong>
          <p>Names, brands, categories, prices, photos, and stock. Add a product, import a sheet, or open one to edit it.</p>
        </article>
        <article>
          <span>Find it</span>
          <strong>Search in a sentence</strong>
          <p>Smart Search turns “running shoes under 9000” into real products. The assistant can greet you, tell you the date, or compare prices it was given.</p>
        </article>
        <article>
          <span>Work with it</span>
          <strong>Groups, drafts, and a record</strong>
          <p>Save a product, compare three, group them in a collection, rewrite a description in AI Studio, and read what changed in Activity.</p>
        </article>
      </div>
      <div className="feat-row">
        <Link className="feat-card" to="/ask"><i className="ai-pill">AI</i><strong>Smart Search</strong><span>Search in a sentence</span></Link>
        <Link className="feat-card" to="/studio"><i className="ai-pill">AI</i><strong>AI Studio</strong><span>Rewrite a listing, then save</span></Link>
        <Link className="feat-card" to="/assistant"><i className="ai-pill">AI</i><strong>Catalog Assistant</strong><span>Ask what is listed</span></Link>
        <Link className="feat-card" to="/future"><i className="ai-pill">AI</i><strong>Future scope</strong><span>Eight features still ahead</span></Link>
      </div>
    </section>
  );
}
