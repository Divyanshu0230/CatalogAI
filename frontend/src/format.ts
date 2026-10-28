import { useEffect, useState } from "react";
import { ApiError } from "./api";

export function friendlyError(err: unknown, fallback: string) {
  if (!(err instanceof ApiError)) return fallback;
  if (/api_key|language model|groq/i.test(err.message)) {
    return "That could not be written just now. You can type it yourself.";
  }
  return err.message;
}

export function money(value: string | number, currency = "INR") {
  const amount = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(amount)) return String(value);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function when(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function day(iso: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(iso));
}

export const ASSISTANT = "Catalog Assistant AI";

export function useTitle(title: string) {
  useEffect(() => {
    document.title = `${title} · CatalogAI`;
  }, [title]);
}

export function useNarrow() {
  const [narrow, setNarrow] = useState(() => window.matchMedia("(max-width: 900px)").matches);
  useEffect(() => {
    const media = window.matchMedia("(max-width: 900px)");
    const onChange = () => setNarrow(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  return narrow;
}
