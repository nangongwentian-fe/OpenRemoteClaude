import { useState } from "react";
import { Sun, Moon } from "lucide-react";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import type { Theme } from "../hooks/useTheme";

interface Props {
  initialized: boolean | null;
  onSetup: (password: string) => Promise<boolean>;
  onLogin: (password: string) => Promise<boolean>;
  error: string | null;
  loading: boolean;
  theme: Theme;
  resolved: "light" | "dark";
  onSetTheme: (t: Theme) => void;
}

export function Login({ initialized, onSetup, onLogin, error, loading, theme, resolved, onSetTheme }: Props) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const isSetup = initialized === false;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSetup) {
      if (password !== confirmPassword) return;
      const ok = await onSetup(password);
      if (ok) await onLogin(password);
    } else {
      await onLogin(password);
    }
  };

  return (
    <div className="relative flex items-center justify-center h-full px-5">
      <button
        onClick={() => onSetTheme(resolved === "dark" ? "light" : "dark")}
        className="absolute top-[calc(1rem+env(safe-area-inset-top,0px))] right-4 p-2 rounded-xl hover:bg-(--color-overlay-hover) text-muted-foreground transition-colors cursor-pointer"
      >
        {resolved === "dark" ? <Sun className="size-5" /> : <Moon className="size-5" />}
      </button>
      <div className="w-full max-w-90 text-center">
        <div className="text-primary mb-4">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="mx-auto">
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5" />
            <path d="M2 12l10 5 10-5" />
          </svg>
        </div>

        <h1 className="text-[22px] font-semibold mb-2">
          {isSetup ? "Set Password" : "Remote Claude Code"}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {isSetup
            ? "Set a password to secure remote access"
            : "Enter your password to connect"}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            minLength={6}
            required
          />
          {isSetup && (
            <Input
              type="password"
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={6}
              required
            />
          )}

          {error && (
            <p className="text-destructive text-[13px]">{error}</p>
          )}
          {isSetup && password && confirmPassword && password !== confirmPassword && (
            <p className="text-destructive text-[13px]">Passwords do not match</p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading || !password || (isSetup && password !== confirmPassword)}
          >
            {loading ? "..." : isSetup ? "Set Password" : "Connect"}
          </Button>
        </form>
      </div>
    </div>
  );
}
