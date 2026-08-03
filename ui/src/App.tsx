import { Suspense, lazy } from "react";
import { Route, Routes } from "react-router-dom";

import { ThemeProvider } from "@/components/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import Landing from "@/pages/Landing";

// The workspace — routing, markdown, radix, the command palette — is a good
// deal heavier than the front page, and most visitors only ever see the front
// page. Keep it behind a split point.
const AppShell = lazy(() => import("@/components/AppShell"));
const NotebookList = lazy(() => import("@/pages/NotebookList"));
const NotebookView = lazy(() => import("@/pages/NotebookView"));

export default function App() {
  return (
    <ThemeProvider>
      <TooltipProvider delayDuration={250}>
        <Suspense fallback={<div className="h-full" />}>
          <Routes>
            {/* Public. No /api/me, no auth gate — this is the front door. */}
            <Route path="/" element={<Landing />} />
            <Route element={<AppShell />}>
              <Route path="/notebooks" element={<NotebookList />} />
              <Route path="/notebook/:id" element={<NotebookView />} />
            </Route>
          </Routes>
        </Suspense>
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
