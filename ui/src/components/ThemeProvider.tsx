import { createContext, useContext, useEffect, useMemo, useState } from "react";

type Theme = "paper" | "ink";

const STORAGE_KEY = "nonstick-theme";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function initialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored === "paper" || stored === "ink") return stored;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "ink"
    : "paper";
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setTheme] = useState<Theme>(initialTheme);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "ink");
    document.documentElement.style.colorScheme =
      theme === "ink" ? "dark" : "light";
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo(
    () => ({
      theme,
      toggle: () => setTheme((t) => (t === "paper" ? "ink" : "paper")),
    }),
    [theme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}

/** Names the stock it is printed on rather than showing a sun and a moon. */
export function ThemeToggle() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className="label flex items-center gap-1.5 rounded-[1px] px-1.5 py-1 transition-colors hover:text-copper-deep"
      aria-label={`Switch to ${theme === "paper" ? "ink" : "paper"} theme`}
    >
      <span
        className={
          theme === "paper"
            ? "size-2 rounded-[1px] border border-current"
            : "size-2 rounded-[1px] bg-current"
        }
      />
      {theme}
    </button>
  );
}
