import { FormEvent, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ApiError } from "../api";
import { useAuth } from "../auth";
import { useTitle } from "../format";
import { AuthFrame } from "./AuthFrame";

export function RegisterPage() {
  const { user, register } = useAuth();
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    username: "",
    email: "",
    password: "",
  });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useTitle("Create account");
  if (user) return <Navigate to="/" replace />;

  function set(key: keyof typeof form, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await register({ ...form, username: form.username.trim(), email: form.email.trim() });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The account could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthFrame
      title="Create an account"
      lede="Your name is attached to the products you add or change. The account is saved in PostgreSQL and is still here the next time you sign in."
      alternate={
        <>
          Already have an account? <Link to="/login">Sign in</Link>
        </>
      }
    >
      <form className="stack" onSubmit={onSubmit}>
        <label className="field">
          First name
          <input className="underline" value={form.first_name} onChange={(event) => set("first_name", event.target.value)} required />
        </label>
        <label className="field">
          Last name
          <input className="underline" value={form.last_name} onChange={(event) => set("last_name", event.target.value)} />
        </label>
        <label className="field">
          Username
          <input className="underline" value={form.username} onChange={(event) => set("username", event.target.value)} required />
        </label>
        <label className="field">
          Email
          <input className="underline" type="email" value={form.email} onChange={(event) => set("email", event.target.value)} required />
        </label>
        <label className="field">
          Password
          <input className="underline" type="password" value={form.password} onChange={(event) => set("password", event.target.value)} minLength={8} required />
        </label>
        {error && <p className="alert" role="alert">{error}</p>}
        <button className="btn" type="submit" disabled={busy}>{busy ? "Creating…" : "Create account"}</button>
      </form>
    </AuthFrame>
  );
}
