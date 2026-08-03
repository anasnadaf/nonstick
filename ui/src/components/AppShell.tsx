import { useCallback, useEffect, useState } from "react";
import { Link, Outlet, useNavigate } from "react-router-dom";
import { toast } from "sonner";

import { ApiError, api, clearToken } from "@/api";
import CommandPalette from "@/components/CommandPalette";
import { ThemeToggle } from "@/components/ThemeProvider";
import Wordmark from "@/components/Wordmark";
import { Button } from "@/components/ui/button";
import Login from "@/pages/Login";
import type { Me } from "@/types";

/**
 * Everything behind the front door: resolves the session, then frames the
 * routed page with the masthead. The landing page deliberately sits outside
 * this so it renders without an /api/me round trip.
 */
export default function AppShell() {
  const [me, setMe] = useState<Me | null>(null);
  const [needsLogin, setNeedsLogin] = useState(false);
  const [resolved, setResolved] = useState(false);
  const navigate = useNavigate();

  const loadMe = useCallback(() => {
    api
      .get<Me>("/api/me")
      .then((m) => {
        setMe(m);
        setNeedsLogin(false);
      })
      .catch((e) => {
        if (e instanceof ApiError && e.status === 401) setNeedsLogin(true);
        else toast.error((e as Error).message);
      })
      .finally(() => setResolved(true));
  }, []);

  useEffect(loadMe, [loadMe]);

  // Hold the frame rather than flashing a login card at an authenticated user.
  if (!resolved) return <div className="h-full" />;
  if (needsLogin) return <Login onLoggedIn={loadMe} />;

  const logout = () => {
    clearToken();
    setMe(null);
    setNeedsLogin(true);
    navigate("/");
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center gap-5 border-b border-rule px-5 py-3">
        <Link to="/" className="transition-opacity hover:opacity-70">
          <Wordmark />
        </Link>
        <Link
          to="/notebooks"
          className="label transition-colors hover:text-copper-deep"
        >
          Notebooks
        </Link>
        <span className="flex-1" />
        <kbd className="label hidden rounded-[1px] border border-rule px-1.5 py-0.5 sm:block">
          ⌘K
        </kbd>
        <ThemeToggle />
        {me && (
          <>
            <span className="label hidden md:block">{me.username}</span>
            {me.auth_enabled && (
              <Button variant="ghost" size="sm" onClick={logout}>
                Sign out
              </Button>
            )}
          </>
        )}
      </header>
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
      <CommandPalette />
    </div>
  );
}
