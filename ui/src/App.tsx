import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { api, ApiError, clearToken } from "./api";
import Login from "./pages/Login";
import NotebookList from "./pages/NotebookList";
import NotebookView from "./pages/NotebookView";
import type { Me } from "./types";

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [error, setError] = useState("");
  const errorTimer = useRef<number>();
  const navigate = useNavigate();

  const showError = useCallback((msg: string) => {
    setError(msg);
    window.clearTimeout(errorTimer.current);
    errorTimer.current = window.setTimeout(() => setError(""), 6000);
  }, []);

  const loadMe = useCallback(() => {
    api
      .get<Me>("/api/me")
      .then((m) => {
        setMe(m);
        setNeedsLogin(false);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) setNeedsLogin(true);
        else showError((e as Error).message);
      });
  }, [showError]);

  useEffect(() => {
    loadMe();
  }, [loadMe]);

  if (needsLogin) {
    return <Login onLoggedIn={loadMe} />;
  }

  const logout = () => {
    clearToken();
    setMe(null);
    setNeedsLogin(true);
    navigate("/");
  };

  return (
    <>
      <nav className="topbar">
        <Link className="brand" to="/">
          NonStick<span>.ai</span>
        </Link>
        <span className="spacer" />
        {me && (
          <>
            <span className="user">{me.username}</span>
            {me.auth_enabled && (
              <button className="ghost" onClick={logout}>
                Sign out
              </button>
            )}
          </>
        )}
      </nav>
      {error && <div className="error-banner">{error}</div>}
      <Routes>
        <Route path="/" element={<NotebookList onError={showError} />} />
        <Route path="/notebook/:id" element={<NotebookView onError={showError} />} />
      </Routes>
    </>
  );
}
