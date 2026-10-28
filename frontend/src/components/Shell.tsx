import { type MouseEvent } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../auth";
import { useHold } from "../hold";
import { useSaved } from "../saved";
import { ThemeToggle } from "../theme";
import { ChatDock } from "./ChatDock";

const LINKS = [
  ["/", "Products"],
  ["/ask", "Smart Search"],
  ["/studio", "AI Studio"],
  ["/assistant", "Assistant AI"],
  ["/insights", "Dashboard"],
  ["/collections", "Collections"],
  ["/compare", "Compare"],
  ["/saved", "Saved"],
  ["/activity", "Activity"],
  ["/future", "Future scope"],
  ["/about", "About us"],
] as const;

export function Shell() {
  const { user, logout } = useAuth();
  const hold = useHold();
  const saved = useSaved();
  const navigate = useNavigate();
  const name = user ? `${user.first_name} ${user.last_name}`.trim() || user.username : "";

  function goHome(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    navigate("/");
    window.dispatchEvent(new Event("catalogai-home"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="mark" onClick={goHome}>
          <i>C</i>
          <span>CatalogAI</span>
        </Link>
        <nav>
          {LINKS.map(([path, label]) => (
            <NavLink key={path} to={path} end={path === "/"}>
              {label}
              {path === "/compare" && hold.items.length > 0 && <em>{hold.items.length}</em>}
              {path === "/saved" && saved.items.length > 0 && <em>{saved.items.length}</em>}
            </NavLink>
          ))}
        </nav>
        <div className="top-actions">
          <ThemeToggle />
          <NavLink className="who-link" to="/account">
            {name}
          </NavLink>
          <button type="button" className="text-btn" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>
      <main className="main">
        <Outlet />
      </main>
      <footer className="site-footer">
        <div className="footer-grid">
          <div>
            <h2>Explore</h2>
            <ul>
              <li><Link to="/" onClick={goHome}>Products</Link></li>
              <li><Link to="/ask">Smart Search</Link></li>
              <li><Link to="/studio">AI Studio</Link></li>
              <li><Link to="/assistant">Catalog Assistant AI</Link></li>
              <li><Link to="/insights">Dashboard</Link></li>
            </ul>
          </div>
          <div>
            <h2>Organize</h2>
            <ul>
              <li><Link to="/collections">Collections</Link></li>
              <li><Link to="/compare">Compare</Link></li>
              <li><Link to="/saved">Saved</Link></li>
              <li><Link to="/activity">Activity</Link></li>
              <li><Link to="/account">Your account</Link></li>
            </ul>
          </div>
          <div>
            <h2><Link to="/future">Future scope</Link></h2>
            <ul>
              <li>Photo Match AI</li>
              <li>Voice Shelf AI</li>
              <li>Bundle Composer AI</li>
              <li>Restock Planner AI</li>
              <li>Hindi Copy AI</li>
              <li>Price Coach AI</li>
              <li>Trend Watch AI</li>
              <li>Review Reader AI</li>
            </ul>
          </div>
          <div>
            <h2><Link to="/about">About us</Link></h2>
            <ul>
              <li>A shared catalog you can search, compare, and ask.</li>
              <li>Products, prices, and stock live in one place.</li>
              <li>Catalog Assistant AI answers from those listings.</li>
              <li>Smart Search, AI Studio, and the assistant are on this desk.</li>
            </ul>
          </div>
          <div>
            <h2>On a product</h2>
            <ul>
              <li><Link to="/studio">Rewrite a description</Link></li>
              <li><Link to="/compare">Compare prices</Link></li>
              <li><Link to="/saved">Saved products</Link></li>
              <li><Link to="/insights">Price and stock checks</Link></li>
              <li><Link to="/activity">What changed</Link></li>
            </ul>
          </div>
        </div>
        <div className="footer-base">
          <span>CatalogAI</span>
        </div>
      </footer>
      <ChatDock />
    </div>
  );
}
