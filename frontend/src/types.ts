export type User = {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  date_joined?: string;
};

export type Tokens = {
  access: string;
  refresh: string;
  user: User;
};

export type Product = {
  id: number;
  sku: string;
  name: string;
  brand: string;
  category: string;
  description: string;
  price: string;
  currency: string;
  image_url: string;
  tags: string[];
  attributes: Record<string, string>;
  stock: number;
  status: "draft" | "active" | "archived";
  completeness: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Page<T> = {
  count: number;
  page: number;
  pages: number;
  results: T[];
};

export type Facets = {
  categories: { name: string; count: number }[];
  brands: { name: string; count: number }[];
  price: { min: string; max: string };
};

export type Reading = {
  keywords: string;
  brand: string | null;
  category: string | null;
  min_price: number | null;
  max_price: number | null;
  sort: string;
  source: string;
};

export type SearchResponse = {
  query: string;
  interpretation: Reading;
  meta: { provider: string | null; model: string | null; latency_ms: number | null; fallback: boolean };
  answer: string;
  steps: { label: string; detail: string }[];
  products: Product[];
};

export type Draft = {
  headline: string;
  description: string;
  tags: string[];
  category_suggestion?: string | null;
  attributes: Record<string, string>;
  provider: string;
  model: string;
  latency_ms: number;
};

export type AiStatus = {
  ready: boolean;
  provider: string | null;
  fast_model: string;
  quality_model: string;
  modes: string[];
};

export type Insights = {
  total: number;
  active: number;
  drafts: number;
  missing_image: number;
  thin: number;
  low_stock_count: number;
  low_stock: { id: number; sku: string; name: string; brand: string; stock: number; price: string }[];
  avg_completeness: number;
  by_category: { name: string; count: number; avg_price: string }[];
  near_duplicates: {
    score: number;
    left: { id: number; sku: string; name: string; brand: string; price: string };
    right: { id: number; sku: string; name: string; brand: string; price: string };
  }[];
  price_outliers: {
    id: number;
    sku: string;
    name: string;
    brand: string;
    category: string;
    price: string;
    median: string;
    reason: string;
  }[];
  scanned_at: string;
};

export type Collection = {
  id: number;
  name: string;
  note: string;
  brief: string;
  brief_provider: string;
  products: Product[];
  created_at: string;
  updated_at: string;
};

export type ChatProduct = Pick<Product, "id" | "name" | "brand" | "price" | "currency" | "category">;

export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  products: ChatProduct[];
  created_at: string;
};

export type ConversationSummary = {
  id: number;
  title: string;
  updated_at: string;
};

export type ConversationDetail = ConversationSummary & {
  messages: ChatMessage[];
};

export type ActivityItem = {
  id: number;
  actor: string | null;
  action: string;
  summary: string;
  meta: Record<string, unknown>;
  created_at: string;
};
