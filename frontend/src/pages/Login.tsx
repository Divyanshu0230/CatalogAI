import { FormEvent, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ApiError } from "../api";
import { useAuth } from "../auth";
import { useTitle } from "../format";
import { ThemeToggle } from "../theme";

const BUYERS = [
  { name: "Demo 1", role: "Buyer", username: "demo1", mark: "01" },
  { name: "Demo 2", role: "Manager", username: "demo2", mark: "02" },
  { name: "Demo 3", role: "Editor", username: "demo3", mark: "03" },
];
const PASSWORD = "Catalog123";

const photo = (id: string, x = 0.5, y = 0.5) =>
  `https://images.unsplash.com/${id}?auto=format&fit=crop&w=900&h=680&q=75&crop=focalpoint&fp-x=${x}&fp-y=${y}`;

const SHOTS = [
  { label: "Footwear", src: photo("photo-1542291026-7eec264c27ff", 0.5, 0.55) },
  { label: "Apparel", src: photo("photo-1521572163474-6864f9cf17ab", 0.5, 0.32) },
  { label: "Beauty", src: photo("photo-1611930022073-b7a4ba5fcccd", 0.48, 0.48) },
  { label: "Home", src: photo("photo-1556228720-195a672e8a03", 0.42, 0.5) },
  { label: "Grocery", src: photo("photo-1558642452-9d2a7deb7f62", 0.5, 0.45) },
  { label: "Watches", src: photo("photo-1524805444758-089113d48a6d", 0.62, 0.48) },
  { label: "Electronics", src: photo("photo-1505740420928-5e560c06d30e", 0.5, 0.55) },
  { label: "Jackets", src: photo("photo-1551028719-00167b16eac5", 0.5, 0.42) },
  { label: "Shoes", src: photo("photo-1549298916-b41d501d3772", 0.48, 0.55) },
];

const ORBS = [
  { name: "Smart Search", color: "#12a37a", icon: "search" },
  { name: "AI Studio", color: "#6d5efc", icon: "pen" },
  { name: "Assistant", color: "#f08a24", icon: "chat" },
  { name: "Compare", color: "#e85a9b", icon: "scale" },
  { name: "Collections", color: "#3d7eff", icon: "box" },
  { name: "Dashboard", color: "#1faf6a", icon: "chart" },
  { name: "Activity", color: "#7b61c9", icon: "clock" },
];

function OrbIcon({ name }: { name: string }) {
  if (name === "search") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="2" />
        <path d="M16 16l4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "pen") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 20l4.2-1.1L19 8.1 15.9 5 5.1 15.8 4 20z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "chat") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 6h14v9H8l-3 3V6z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "scale") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 4v16M6 8h12M6 8l-3 6h6L6 8zm12 0l-3 6h6l-3-6z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "box") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 8l8-4 8 4-8 4-8-4zm0 0v8l8 4 8-4V8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "chart") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 19V9M12 19V5M19 19v-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M12 8v5l3 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function LoginPage() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useTitle("Sign in");

  if (user) return <Navigate to="/" replace />;

  async function signIn(nextUser: string, nextPassword: string) {
    setBusy(true);
    setError("");
    setUsername(nextUser);
    setPassword(nextPassword);
    try {
      await login(nextUser, nextPassword);
    } catch (err) {
      setError(err instanceof ApiError && err.status === 401 ? "Those details did not match. Try again." : "Sign in did not go through. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void signIn(username.trim(), password);
  }

  return (
    <div className="login-live">
      <header className="login-top">
        <p className="mark"><i>C</i><span>CatalogAI</span></p>
        <ThemeToggle />
      </header>
      <div className="live-stage" aria-hidden="true">
        <div className="live-window">
          <div className="live-track">
            {[0, 1].map((copy) => (
              <div className="live-set" key={copy}>
                {SHOTS.map((shot) => (
                  <figure key={`${copy}-${shot.label}`}>
                    <img src={shot.src} alt="" />
                    <figcaption>{shot.label}</figcaption>
                  </figure>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      <section className="login-band">
        <h1>Find what is listed. Then ask.</h1>
        <p>Open Demo 1, Demo 2, or Demo 3, or sign in with your own account.</p>
      </section>
      <div className="login-sheet">
        <div className="auth-card login-card">
          <p className="kicker">Sign in</p>
          <div className="buyer-grid">
            {BUYERS.map((buyer) => (
              <button
                key={buyer.username}
                type="button"
                className="buyer-card"
                disabled={busy}
                onClick={() => void signIn(buyer.username, PASSWORD)}
              >
                <i>{buyer.mark}</i>
                <span>
                  <strong>{buyer.name}</strong>
                  <em>{buyer.role}</em>
                  <small>Click to sign in · {buyer.username}</small>
                </span>
              </button>
            ))}
          </div>
          <p className="buyer-note">Password for Demo 1, Demo 2, and Demo 3: {PASSWORD}</p>
          <p className="or-line"><span>or type your own account</span></p>
          <form className="stack" onSubmit={onSubmit}>
            <label className="field">
              Username
              <input className="underline" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
            </label>
            <label className="field pass">
              Password
              <input
                className="underline"
                type={show ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
              <button type="button" onClick={() => setShow((value) => !value)}>
                {show ? "Hide" : "Show"}
              </button>
            </label>
            {error && <p className="alert" role="alert">{error}</p>}
            <button className="btn gold" type="submit" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
          <p className="auth-alt">New here? <Link to="/register">Create an account</Link></p>
        </div>
        <div className="float-row">
          {ORBS.map((orb) => (
            <div className="float-orb" key={orb.name}>
              <em>Sign in first to use {orb.name}</em>
              <i style={{ background: orb.color }}><OrbIcon name={orb.icon} /></i>
              <span>{orb.name}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
