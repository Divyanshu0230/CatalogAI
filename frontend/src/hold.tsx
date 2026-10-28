import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Product } from "./types";

export type HoldItem = Pick<Product, "id" | "sku" | "name" | "brand" | "price" | "currency" | "image_url" | "category">;

type HoldValue = {
  items: HoldItem[];
  has: (id: number) => boolean;
  toggle: (product: HoldItem) => boolean;
  remove: (id: number) => void;
  clear: () => void;
};

const HoldContext = createContext<HoldValue | null>(null);
const KEY = "vitrine.hold";

function read(): HoldItem[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]") as HoldItem[];
    return Array.isArray(parsed) ? parsed.slice(0, 3) : [];
  } catch {
    return [];
  }
}

export function HoldProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<HoldItem[]>(read);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(items));
  }, [items]);

  const value = useMemo<HoldValue>(
    () => ({
      items,
      has: (id) => items.some((item) => item.id === id),
      toggle(product: HoldItem) {
        const exists = items.some((item) => item.id === product.id);
        if (exists) {
          setItems((current) => current.filter((item) => item.id !== product.id));
          return true;
        }
        if (items.length >= 3) return false;
        const next: HoldItem = {
          id: product.id,
          sku: product.sku,
          name: product.name,
          brand: product.brand,
          price: product.price,
          currency: product.currency,
          image_url: product.image_url,
          category: product.category,
        };
        setItems((current) => [...current, next]);
        return true;
      },
      remove(id) {
        setItems((current) => current.filter((item) => item.id !== id));
      },
      clear() {
        setItems([]);
      },
    }),
    [items],
  );

  return <HoldContext.Provider value={value}>{children}</HoldContext.Provider>;
}

export function useHold() {
  const value = useContext(HoldContext);
  if (!value) throw new Error("Hold list is missing");
  return value;
}
