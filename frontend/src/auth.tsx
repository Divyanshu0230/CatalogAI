import { createContext, useContext, useMemo, useState } from "react";
import { api } from "./api";
import type { Tokens, User } from "./types";

type AuthValue = {
  user: User | null;
  login: (username: string, password: string) => Promise<void>;
  register: (payload: {
    username: string;
    email: string;
    password: string;
    first_name: string;
    last_name: string;
  }) => Promise<void>;
  setUser: (user: User) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

function readUser(): User | null {
  const raw = localStorage.getItem("vitrine.user");
  const token = localStorage.getItem("vitrine.access");
  if (!raw || !token) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

function store(tokens: Tokens) {
  localStorage.setItem("vitrine.access", tokens.access);
  localStorage.setItem("vitrine.refresh", tokens.refresh);
  localStorage.setItem("vitrine.user", JSON.stringify(tokens.user));
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setStored] = useState<User | null>(readUser);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      async login(username, password) {
        const tokens = await api<Tokens>("/api/auth/login/", {
          method: "POST",
          body: JSON.stringify({ username, password }),
        });
        store(tokens);
        setStored(tokens.user);
      },
      async register(payload) {
        const tokens = await api<Tokens>("/api/auth/register/", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        store(tokens);
        setStored(tokens.user);
      },
      setUser(next) {
        localStorage.setItem("vitrine.user", JSON.stringify(next));
        setStored(next);
      },
      logout() {
        localStorage.removeItem("vitrine.access");
        localStorage.removeItem("vitrine.refresh");
        localStorage.removeItem("vitrine.user");
        setStored(null);
      },
    }),
    [user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("Auth is missing");
  return value;
}
