import { useState } from "react";

import { setToken } from "@/api";
import AmbientField from "@/components/three/AmbientField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Posts credentials to the external auth service (same-origin /auth/* is
 * reverse-proxied to it in production).
 *
 * portfolio-auth keys accounts on email, not a username — it validates the
 * field with mail.ParseAddress and rejects anything else with a 400. */
export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const resp = await fetch("/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!resp.ok) {
        setError(
          resp.status === 401
            ? "Invalid credentials"
            : `Login failed (${resp.status})`,
        );
        return;
      }
      const data = await resp.json();
      const token = data.token ?? data.access_token;
      if (!token) {
        setError("Auth service returned no token");
        return;
      }
      setToken(token);
      onLoggedIn();
    } catch {
      setError("Auth service unreachable");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grain relative flex h-full items-center justify-center overflow-hidden px-5">
      <AmbientField />

      <form
        className="relative w-full max-w-[360px] border border-rule bg-background/85 p-10"
        onSubmit={(e) => void submit(e)}
      >
        <p className="label mb-5 flex items-center gap-3">
          <span className="inline-block h-px w-6 bg-copper" />
          Sign in
        </p>

        <h1 className="font-display text-3xl font-semibold tracking-[-0.02em]">
          NonStick<span className="text-copper">.ai</span>
        </h1>
        <p className="mt-2 text-[13px] text-ink-muted">
          Your notebooks are waiting.
        </p>

        <div className="mt-9 flex flex-col gap-6">
          <label className="flex flex-col gap-1.5">
            <span className="label">Email</span>
            <Input
              type="email"
              value={email}
              autoComplete="email"
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="label">Password</span>
            <Input
              type="password"
              value={password}
              autoComplete="current-password"
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        </div>

        {error && (
          <p className="mt-5 border-l-2 border-vermilion pl-3 text-[13px] text-vermilion">
            {error}
          </p>
        )}

        <Button
          className="mt-8 w-full"
          size="lg"
          disabled={busy || !email || !password}
        >
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}
