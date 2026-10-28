import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, ApiError } from "../api";
import { ImageTile } from "../components/ImageTile";
import { ASSISTANT, friendlyError, money, useTitle } from "../format";
import { useToast } from "../toast";
import type { Draft, Facets, Product } from "../types";

const EMPTY = {
  name: "",
  brand: "",
  category: "",
  description: "",
  price: "",
  currency: "INR",
  image_url: "",
  tags: "",
  stock: "0",
  status: "active",
  color: "",
  material: "",
  audience: "",
};

export function ProductFormPage() {
  const { id } = useParams();
  const editing = Boolean(id);
  const [form, setForm] = useState(EMPTY);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [imageBroken, setImageBroken] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const navigate = useNavigate();
  const toast = useToast();
  useTitle(editing ? "Edit product" : "New product");

  useEffect(() => {
    api<Facets>("/api/products/facets/")
      .then(setFacets)
      .catch(() => setFacets(null));
  }, []);

  useEffect(() => {
    if (!id) return;
    api<Product>(`/api/products/${id}/`).then((product) => {
      setForm({
        name: product.name,
        brand: product.brand,
        category: product.category,
        description: product.description,
        price: product.price,
        currency: product.currency,
        image_url: product.image_url,
        tags: product.tags.join(", "),
        stock: String(product.stock),
        status: product.status,
        color: product.attributes.color || "",
        material: product.attributes.material || "",
        audience: product.attributes.audience || "",
      });
    });
  }, [id]);

  function set<K extends keyof typeof EMPTY>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (Number(form.price) < 0 || Number.isNaN(Number(form.price))) {
      setError("Price has to be a number that is not negative.");
      return;
    }
    setBusy(true);
    setError("");
    const attributes: Record<string, string> = {};
    if (form.color) attributes.color = form.color;
    if (form.material) attributes.material = form.material;
    if (form.audience) attributes.audience = form.audience;
    const payload = {
      name: form.name,
      brand: form.brand,
      category: form.category,
      description: form.description,
      price: form.price,
      currency: form.currency,
      image_url: form.image_url,
      stock: Number(form.stock || 0),
      status: form.status,
      tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      attributes,
    };
    try {
      const saved = await api<Product>(editing ? `/api/products/${id}/` : "/api/products/", {
        method: editing ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      toast(editing ? `Revised ${saved.sku}.` : `Added ${saved.sku}.`);
      navigate(`/products/${saved.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "The product could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function draftStory() {
    setDrafting(true);
    setError("");
    try {
      const result = await api<Draft>("/api/ai/describe/", {
        method: "POST",
        body: JSON.stringify({
          name: form.name,
          brand: form.brand,
          category: form.category,
          currency: form.currency,
          note: form.description,
          ...(form.price ? { price: form.price } : {}),
        }),
      });
      setDraft(result);
    } catch (err) {
      setError(friendlyError(err, "A description could not be written just now. You can type one yourself."));
    } finally {
      setDrafting(false);
    }
  }

  function useDraft() {
    if (!draft) return;
    setForm((current) => ({
      ...current,
      description: draft.description,
      tags: draft.tags.join(", "),
      color: draft.attributes.color || current.color,
      material: draft.attributes.material || current.material,
      audience: draft.attributes.audience || current.audience,
    }));
    setDraft(null);
    toast("Draft is in the form. Read it before you save.");
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <p className="kicker">{editing ? "Edit" : "New product"}</p>
          <h1>{editing ? form.name || "Edit product" : "Add a product"}</h1>
        </div>
        <Link className="btn ghost" to={id ? `/products/${id}` : "/"}>
          Cancel
        </Link>
      </header>
      <form className="form-grid" onSubmit={onSubmit}>
        <label className="field">
          Name
          <input className="underline" value={form.name} onChange={(event) => set("name", event.target.value)} required />
        </label>
        <label className="field">
          Brand
          <input className="underline" list="brands" value={form.brand} onChange={(event) => set("brand", event.target.value)} required />
          <datalist id="brands">
            {facets?.brands.map((item) => (
              <option key={item.name} value={item.name} />
            ))}
          </datalist>
        </label>
        <label className="field">
          Category
          <input className="underline" list="categories" value={form.category} onChange={(event) => set("category", event.target.value)} required />
          <datalist id="categories">
            {facets?.categories.map((item) => (
              <option key={item.name} value={item.name} />
            ))}
          </datalist>
        </label>
        <label className="field">
          Price
          <input className="underline" inputMode="decimal" value={form.price} onChange={(event) => set("price", event.target.value)} required />
        </label>
        <label className="field">
          Currency
          <select className="underline" value={form.currency} onChange={(event) => set("currency", event.target.value)}>
            <option>INR</option>
            <option>USD</option>
            <option>EUR</option>
          </select>
        </label>
        <label className="field">
          On hand
          <input className="underline" inputMode="numeric" value={form.stock} onChange={(event) => set("stock", event.target.value)} />
        </label>
        <label className="field">
          State
          <select className="underline" value={form.status} onChange={(event) => set("status", event.target.value)}>
            <option value="active">Active</option>
            <option value="draft">Draft</option>
            <option value="archived">Archived</option>
          </select>
        </label>
        <label className="field wide">
          Image URL
          <input
            className="underline"
            value={form.image_url}
            onChange={(event) => {
              setImageBroken(false);
              set("image_url", event.target.value);
            }}
            placeholder="https://…/photo.jpg"
          />
        </label>
        {form.image_url && /\.(html?|php)(\?|#|$)/i.test(form.image_url) && (
          <p className="alert wide">This link opens a web page. Right-click the photo on that page and copy the image address. It needs to be the picture file, usually a .jpg or .png.</p>
        )}
        {form.image_url && (
          <div className="wide form-shot">
            <ImageTile
              key={form.image_url}
              src={form.image_url}
              name={form.name || "Preview"}
              category={form.category || "Home"}
              onFail={() => setImageBroken(true)}
            />
          </div>
        )}
        {imageBroken && !/\.(html?|php)(\?|#|$)/i.test(form.image_url) && (
          <p className="alert wide">That address did not load as a photo. Paste the image file itself, not the page it sits on.</p>
        )}
        <label className="field wide">
          Description
          <textarea className="underline" value={form.description} onChange={(event) => set("description", event.target.value)} />
        </label>
        <div className="wide">
          <button type="button" className="btn ghost" disabled={drafting || !form.name || !form.brand} onClick={() => void draftStory()}>
            {drafting ? "Writing…" : `Enhance with ${ASSISTANT}`}
          </button>
          {form.price && <span className="lede"> Listed at {money(form.price || "0", form.currency)}.</span>}
        </div>
        {draft && (
          <div className="draft wide">
            <p className="kicker">{ASSISTANT}</p>
            {draft.headline && <h3>{draft.headline}</h3>}
            <p>{draft.description}</p>
            <div className="tags">
              {draft.tags.map((tag) => (
                <span className="tag" key={tag}>
                  {tag}
                </span>
              ))}
            </div>
            {draft.category_suggestion && <p className="lede">Suggested category: {draft.category_suggestion}</p>}
            <div className="actions">
              <button type="button" className="btn" onClick={useDraft}>
                Use description and tags
              </button>
              {draft.headline && (
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    set("name", draft.headline);
                    toast("Title is in the name field. Read it before you save.");
                  }}
                >
                  Use this title
                </button>
              )}
              {draft.category_suggestion && (
                <button type="button" className="btn ghost" onClick={() => set("category", draft.category_suggestion || "")}>
                  Use this category
                </button>
              )}
            </div>
            <p className="signed">{ASSISTANT}</p>
          </div>
        )}
        <label className="field wide">
          Tags, comma separated
          <input className="underline" value={form.tags} onChange={(event) => set("tags", event.target.value)} />
        </label>
        <label className="field">
          Color
          <input className="underline" value={form.color} onChange={(event) => set("color", event.target.value)} />
        </label>
        <label className="field">
          Material
          <input className="underline" value={form.material} onChange={(event) => set("material", event.target.value)} />
        </label>
        <label className="field">
          Audience
          <input className="underline" value={form.audience} onChange={(event) => set("audience", event.target.value)} />
        </label>
        {error && (
          <p className="alert wide" role="alert">
            {error}
          </p>
        )}
        <div className="wide">
          <button className="btn" type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save product"}
          </button>
        </div>
      </form>
    </section>
  );
}
