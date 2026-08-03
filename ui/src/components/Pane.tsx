import { cn } from "@/lib/utils";

export function Pane({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {children}
    </div>
  );
}

export function PaneHeader({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-rule px-4">
      <span className="label">{title}</span>
      <span className="flex-1" />
      {children}
    </div>
  );
}

export function PaneBody({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-h-0 flex-1 overflow-y-auto", className)}>
      {children}
    </div>
  );
}
