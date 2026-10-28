import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { AuthProvider } from "./auth";
import { HoldProvider } from "./hold";
import { SavedProvider } from "./saved";
import { ThemeProvider } from "./theme";
import { ToastProvider } from "./toast";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            <HoldProvider>
              <SavedProvider>
                <App />
              </SavedProvider>
            </HoldProvider>
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
