import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Product } from "./types";

export type SavedItem = Pick<Product, "id" | "sku" | "name" | "brand" | "price" | "currency" | "image_url" | "category" | "stock">;

type SavedValue = {
  items: SavedItem[];
  has: (id: number) => boolean;
  toggle: (product: Product) => void;
  remove: (id: number) => void;
};

const SavedContext = createContext<SavedValue | null>(null);
const KEY = "catalogai.saved";

function read(): SavedItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]") as SavedItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function SavedProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<SavedItem[]>(read);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(items));
  }, [items]);

  const value = useMemo<SavedValue>(
    () => ({
      items,
      has: (id) => items.some((item) => item.id === id),
      toggle(product) {
        setItems((current) => {
          if (current.some((item) => item.id === product.id)) {
            return current.filter((item) => item.id !== product.id);
          }
          return [
            {
              id: product.id,
              sku: product.sku,
              name: product.name,
              brand: product.brand,
              price: product.price,
              currency: product.currency,
              image_url: product.image_url,
              category: product.category,
              stock: product.stock,
            },
            ...current,
          ];
        });
      },
      remove(id) {
        setItems((current) => current.filter((item) => item.id !== id));
      },
    }),
    [items],
  );

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}

export function useSaved() {
  const value = useContext(SavedContext);
  if (!value) throw new Error("Saved list is missing");
  return value;
}
