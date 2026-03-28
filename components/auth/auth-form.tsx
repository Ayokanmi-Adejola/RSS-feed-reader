"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "sign-in" | "sign-up" | "reset";

type AuthFormProps = {
  mode: Mode;
};

export default function AuthForm({ mode }: AuthFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  const submitLabel = mode === "sign-in" ? "Sign in" : mode === "sign-up" ? "Create account" : "Send reset link";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    const supabase = createClient();

    if (mode === "sign-in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
      } else {
        window.location.href = "/dashboard";
      }
    } else if (mode === "sign-up") {
      const { error } = await supabase.auth.signUp({ email, password });
      setMessage(error ? error.message : "Account created. Check your inbox to verify email.");
    } else {
      const redirectTo = `${window.location.origin}/auth/sign-in`;
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      setMessage(error ? error.message : "Password reset link sent.");
    }

    setLoading(false);
  }

  return (
    <main className="landing-shell" id="main-content">
      <section className="hero-panel" aria-labelledby="auth-heading" style={{ maxWidth: "30rem" }}>
        <h1 id="auth-heading">{submitLabel}</h1>
        <form onSubmit={onSubmit} style={{ display: "grid", gap: "0.75rem" }}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            className="field"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />

          {mode !== "reset" ? (
            <>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                className="field"
                type="password"
                autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </>
          ) : null}

          <button className="btn btn-primary" disabled={loading} type="submit">
            {loading ? "Please wait..." : submitLabel}
          </button>
        </form>

        {message ? <p className="meta" aria-live="polite">{message}</p> : null}

        <div className="pill-row" style={{ marginTop: "1rem" }}>
          <Link className="pill" href="/auth/sign-in">Sign in</Link>
          <Link className="pill" href="/auth/sign-up">Create account</Link>
          <Link className="pill" href="/auth/reset-password">Reset password</Link>
        </div>
      </section>
    </main>
  );
}
