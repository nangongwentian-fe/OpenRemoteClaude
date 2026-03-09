import { useState, useCallback, useEffect } from "react";

const TOKEN_KEY = "rcc_token";

export function useAuth() {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(TOKEN_KEY)
  );
  const [initialized, setInitialized] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 检查是否已设置密码
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/auth/status", { signal: controller.signal })
      .then((r) => r.json())
      .then((data: { initialized: boolean }) => setInitialized(data.initialized))
      .catch((err) => {
        if (err.name !== "AbortError") setInitialized(false);
      });
    return () => controller.abort();
  }, []);

  const setup = useCallback(async (password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Setup failed");
        return false;
      }
      setInitialized(true);
      return true;
    } catch {
      setError("Connection failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const login = useCallback(async (password: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Login failed");
        return false;
      }
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      return true;
    } catch {
      setError("Connection failed");
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  return { token, initialized, error, loading, setup, login, logout };
}
