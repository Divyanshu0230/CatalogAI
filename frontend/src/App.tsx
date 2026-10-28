import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth";
import { Shell } from "./components/Shell";
import { AccountPage } from "./pages/Account";
import { AssistantPage } from "./pages/Assistant";
import { AboutPage } from "./pages/About";
import { ActivityPage } from "./pages/Activity";
import { AskPage } from "./pages/Ask";
import { CatalogPage } from "./pages/Catalog";
import { CollectionsPage } from "./pages/Collections";
import { ComparePage } from "./pages/Compare";
import { FuturePage } from "./pages/Future";
import { InsightsPage } from "./pages/Insights";
import { LoginPage } from "./pages/Login";
import { ProductDetailPage } from "./pages/ProductDetail";
import { ProductFormPage } from "./pages/ProductForm";
import { RegisterPage } from "./pages/Register";
import { SavedPage } from "./pages/Saved";
import { StudioPage } from "./pages/Studio";

function RequireAuth() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Shell />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route element={<RequireAuth />}>
        <Route path="/" element={<CatalogPage />} />
        <Route path="/ask" element={<AskPage />} />
        <Route path="/studio" element={<StudioPage />} />
        <Route path="/assistant" element={<AssistantPage />} />
        <Route path="/insights" element={<InsightsPage />} />
        <Route path="/collections" element={<CollectionsPage />} />
        <Route path="/compare" element={<ComparePage />} />
        <Route path="/saved" element={<SavedPage />} />
        <Route path="/activity" element={<ActivityPage />} />
        <Route path="/future" element={<FuturePage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/products/new" element={<ProductFormPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/products/:id/edit" element={<ProductFormPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
