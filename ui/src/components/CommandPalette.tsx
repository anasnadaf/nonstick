import { useEffect, useState } from "react";
import { BookOpen, FilePlus2, LayoutGrid, SunMoon } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { api } from "@/api";
import { useTheme } from "@/components/ThemeProvider";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import type { Notebook } from "@/types";

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const navigate = useNavigate();
  const { toggle } = useTheme();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Only pay for the list once the palette is actually summoned.
  useEffect(() => {
    if (!open) return;
    api
      .get<Notebook[]>("/api/notebooks")
      .then(setNotebooks)
      .catch(() => setNotebooks([]));
  }, [open]);

  const run = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title="Command palette"
      description="Jump to a notebook or run an action"
    >
      <CommandInput placeholder="Jump to a notebook, or run an action…" />
      <CommandList>
        <CommandEmpty>Nothing matches.</CommandEmpty>
        {notebooks.length > 0 && (
          <CommandGroup heading="Notebooks">
            {notebooks.map((nb) => (
              <CommandItem
                key={nb.id}
                value={`${nb.title} ${nb.id}`}
                onSelect={run(() => navigate(`/notebook/${nb.id}`))}
              >
                <BookOpen />
                <span className="flex-1 truncate">{nb.title}</span>
                <span className="label tnum">
                  {nb.source_count} src
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            onSelect={run(() =>
              navigate("/notebooks", { state: { create: true } }),
            )}
          >
            <FilePlus2 />
            New notebook
          </CommandItem>
          <CommandItem onSelect={run(() => navigate("/notebooks"))}>
            <LayoutGrid />
            All notebooks
          </CommandItem>
          <CommandItem onSelect={run(toggle)}>
            <SunMoon />
            Switch paper / ink
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
