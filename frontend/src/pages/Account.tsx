import { FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api";
import { useAuth } from "../auth";
import { useTitle, when } from "../format";
import { useToast } from "../toast";
import type { User } from "../types";

const PATHS = [
  {
    label: "Smart Search",
    title: "Search in a sentence",
    text: "Cheapest tea, Nike jackets, headphones under ₹5,000. The results are products on this shelf.",
    to: "/ask",
    action: "Open Smart Search",
  },
  {
    label: "AI Studio",
    title: "Rewrite a listing",
    text: "Pick a short description. Catalog Assistant AI drafts the copy, and you decide whether to save it.",
    to: "/studio",
    action: "Open AI Studio",
  },
  {
    label: "Catalog Assistant",
    title: "Ask the catalog",
    text: "Greet it, ask the date, or which saved product is cheaper. It does not invent a product.",
    to: "/assistant",
    action: "Open the assistant",
  },
];

export function AccountPage() {
  const { user, setUser } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ first_name: "", last_name: "", email: "" });
  const [joined, setJoined] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useTitle("Account");

  useEffect(() => {
    api<User>("/api/auth/me/")
      .then((profile) => {
        setUser(profile);
        setForm({
          first_name: profile.first_name,
          last_name: profile.last_name,
          email: profile.email,
        });
        setJoined(profile.date_joined || "");
      })
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : "Your account did not load."));
    // Load the saved account once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const name = user ? `${user.first_name} ${user.last_name}`.trim() || user.username : "Your account";

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const profile = await api<User>("/api/auth/me/", {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      setUser(profile);
      toast("Account details saved.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Those details could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <header className="page-stage">
        <p className="kicker">Your account</p>
        <h1>{name}</h1>
        <p>
          Signed in as {user?.username || "…"}.
          {joined ? ` Joined ${when(joined)}.` : ""} This desk is where your name sits on products you add, and where you open the AI tools.
        </p>
      </header>
      <div className="gem-row">
        {PATHS.map((item) => (
          <Link key={item.to} className="gem-card" to={item.to}>
            <span><i className="ai-pill">AI</i> {item.label}</span>
            <strong>{item.title}</strong>
            <p>{item.text}</p>
            <em>{item.action}</em>
          </Link>
        ))}
      </div>
      <div className="account-layout">
        <form className="panel account-form" onSubmit={onSubmit}>
          <p className="kicker">Details</p>
          <h2>Name and email</h2>
          <p className="lede">The name shows in the top bar and on products you add or edit.</p>
          <label className="field">
            First name
            <input className="underline" value={form.first_name} onChange={(event) => setForm({ ...form, first_name: event.target.value })} required />
          </label>
          <label className="field">
            Last name
            <input className="underline" value={form.last_name} onChange={(event) => setForm({ ...form, last_name: event.target.value })} />
          </label>
          <label className="field">
            Email
            <input className="underline" type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} required />
          </label>
          {error && <p className="alert" role="alert">{error}</p>}
          <button className="btn gold" type="submit" disabled={busy}>{busy ? "Saving…" : "Save details"}</button>
        </form>
        <aside className="panel account-facts">
          <p className="kicker">This sign-in</p>
          <h2>What stays with you</h2>
          <div>
            <span>Username</span>
            <strong>{user?.username || "…"}</strong>
          </div>
          <div>
            <span>Email</span>
            <strong>{form.email || "…"}</strong>
          </div>
          <div>
            <span>Also on this desk</span>
            <strong>Compare, collections, saved products, and the activity log.</strong>
          </div>
          <div className="account-links">
            <Link to="/compare">Compare</Link>
            <Link to="/collections">Collections</Link>
            <Link to="/saved">Saved</Link>
            <Link to="/insights">Dashboard</Link>
            <Link to="/activity">Activity</Link>
          </div>
        </aside>
      </div>
    </section>
  );
}
