import { useState } from "react";
import { setToken } from "../api";

/** Posts credentials to the external auth service (same-origin /auth/* is
 * reverse-proxied to it in production). */
export default function Login({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [username, setUsername] = useState("");
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
        body: JSON.stringify({ username, password }),
      });
      if (!resp.ok) {
        setError(resp.status === 401 ? "Invalid credentials" : `Login failed (${resp.status})`);
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
    <div className="login-page">
      <form className="login-card" onSubmit={(e) => void submit(e)}>
        <h1>NonStick.ai</h1>
        <p style={{ margin: 0, color: "var(--text-dim)", fontSize: 13 }}>
          Sign in to your notebooks
        </p>
        <input
          placeholder="Username"
          value={username}
          autoComplete="username"
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          placeholder="Password"
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <div className="error">{error}</div>}
        <button className="primary" disabled={busy || !username || !password}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
