import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "./api";
import type { Facets, Page, Product, SearchResponse } from "./types";

export async function findListed(text: string): Promise<Product[]> {
  const cleaned = text.trim();
  if (cleaned.length < 2) return [];
  const sentence = cleaned.split(/\s+/).length >= 3 || /(under|above|below|between|cheap|premium|₹|rs\b)/i.test(cleaned);
  if (sentence) {
    const data = await api<SearchResponse>("/api/ai/search/", {
      method: "POST",
      body: JSON.stringify({ query: cleaned }),
    });
    return data.products;
  }
  const page = await api<Page<Product>>(`/api/products/?q=${encodeURIComponent(cleaned)}&page_size=8`);
  return page.results;
}

export const TRIES = [
  "cheapest tea",
  "running shoes under ₹9,000",
  "Nike jackets",
  "headphones under ₹5,000",
  "premium watches above ₹50,000",
  "something for a monsoon commute",
  "Brooke Bond tea",
];

export const CHAT_TRIES = [...TRIES, "what is low on stock?"];

type Listed = { id: number; name: string; brand: string };

type Hints = {
  categories: string[];
  brands: string[];
  products: Listed[];
};

let pending: Promise<Hints> | null = null;
let stored: Hints | null = null;

function loadHints() {
  if (stored) return Promise.resolve(stored);
  if (!pending) {
    pending = Promise.all([
      api<Facets>("/api/products/facets/"),
      api<Page<Product>>("/api/products/?page_size=8"),
    ])
      .then(([facets, page]) => {
        stored = {
          categories: facets.categories.map((item) => item.name),
          brands: facets.brands.map((item) => item.name).slice(0, 8),
          products: page.results.map((item) => ({ id: item.id, name: item.name, brand: item.brand })),
        };
        return stored;
      })
      .catch(() => {
        pending = null;
        return { categories: [], brands: [], products: [] };
      });
  }
  return pending;
}

export function InCatalog({
  onQuery,
  onProduct,
  title = "In this catalog",
  note = "These are listed. A random word often is not.",
  compact = false,
}: {
  onQuery?: (text: string) => void;
  onProduct?: (id: number) => void;
  title?: string;
  note?: string;
  compact?: boolean;
}) {
  const [hints, setHints] = useState<Hints | null>(stored);

  useEffect(() => {
    let live = true;
    loadHints().then((data) => {
      if (live) setHints(data);
    });
    return () => {
      live = false;
    };
  }, []);

  function queryChip(text: string) {
    if (onQuery) {
      return (
        <button key={text} type="button" className="chip" onClick={() => onQuery(text)}>
          {text}
        </button>
      );
    }
    return (
      <Link key={text} className="chip" to={`/ask?q=${encodeURIComponent(text)}`}>
        {text}
      </Link>
    );
  }

  return (
    <div className="hint-block">
      <h2>{title}</h2>
      <p>{note}</p>
      <div className="hint-row">
        <span>Try</span>
        {TRIES.map((text) => queryChip(text))}
      </div>
      {!compact && hints && hints.categories.length > 0 && (
        <div className="hint-row">
          <span>Categories</span>
          {hints.categories.map((name) => (
            <Link key={name} className="chip" to={`/?category=${encodeURIComponent(name)}`}>
              {name}
            </Link>
          ))}
        </div>
      )}
      {!compact && hints && hints.brands.length > 0 && (
        <div className="hint-row">
          <span>Brands</span>
          {hints.brands.map((name) => (
            <Link key={name} className="chip" to={`/?brand=${encodeURIComponent(name)}`}>
              {name}
            </Link>
          ))}
        </div>
      )}
      {hints && hints.products.length > 0 && (
        <div className="hint-row">
          <span>Products</span>
          {hints.products.slice(0, compact ? 4 : 8).map((item) => (
            onProduct ? (
              <button key={item.id} type="button" className="chip" onClick={() => onProduct(item.id)}>
                {item.brand} {item.name}
              </button>
            ) : (
              <Link key={item.id} className="chip" to={`/products/${item.id}`}>
                {item.brand} {item.name}
              </Link>
            )
          ))}
        </div>
      )}
    </div>
  );
}
