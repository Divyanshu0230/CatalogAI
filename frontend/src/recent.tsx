import { Link } from "react-router-dom";
import { money } from "./format";

const KEY = "catalogai.seen";

export type Seen = {
  id: number;
  name: string;
  brand: string;
  price: string;
  currency: string;
};

export function rememberProduct(item: Seen) {
  const next = [item, ...readSeen().filter((row) => row.id !== item.id)].slice(0, 6);
  localStorage.setItem(KEY, JSON.stringify(next));
}

export function readSeen(): Seen[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]") as Seen[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function RecentStrip() {
  const rows = readSeen();
  if (!rows.length) return null;
  return (
    <div className="recent-strip">
      <p className="kicker">Recently viewed</p>
      <div className="chips">
        {rows.map((row) => (
          <Link key={row.id} className="chip" to={`/products/${row.id}`}>
            {row.brand} {row.name} · {money(row.price, row.currency)}
          </Link>
        ))}
      </div>
    </div>
  );
}
