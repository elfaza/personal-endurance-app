"use client";
import { useState } from "react";
import { ArrowRight, LockKeyhole, Mountain } from "lucide-react";
import { request } from "@/components/providers";
import { Button } from "@/components/ui/button";
export default function Login() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await request("/api/auth", { password: form.get("password") });
      location.assign(new URL("/dashboard", location.origin).href);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <div className="login-brand">
        <span className="brand-icon">
          <Mountain size={26} />
        </span>
        <span>personal endurance</span>
      </div>
      <div className="login-card panel">
        <span className="eyebrow">
          <LockKeyhole size={14} /> YOUR PRIVATE TRAINING SPACE
        </span>
        <h1>
          Back to
          <br />
          your journey<span className="accent">.</span>
        </h1>
        <p>One session at a time. Sign in to keep moving.</p>
        <form onSubmit={submit}>
          <label>
            App password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              maxLength={1024}
            />
          </label>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          <Button disabled={busy}>
            {busy ? "Signing in…" : "Continue to your training"}
            <ArrowRight size={17} />
          </Button>
        </form>
        <p className="helper">
          First time? Configure APP_PASSWORD and SESSION_SECRET in your server
          environment. Local development demo mode can be opened at{" "}
          <a href="/dashboard">the dashboard</a>.
        </p>
      </div>
      <p className="login-footer">SMALL STEPS. STRONGER YOU.</p>
    </main>
  );
}
