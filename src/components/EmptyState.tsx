import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Centered stage placeholder for states where the strip has nothing to show. */
export function EmptyState({
  icon: Icon,
  title,
  body,
}: {
  icon: LucideIcon;
  title: string;
  body?: ReactNode;
}) {
  return (
    <div className="grid h-full place-items-center px-10 text-center">
      <div className="flex max-w-sm flex-col items-center">
        <div className="mb-4 grid size-12 place-items-center rounded-2xl border border-border bg-background text-muted-foreground shadow-xs">
          <Icon className="size-5" strokeWidth={1.75} aria-hidden />
        </div>
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {body ? (
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
        ) : null}
      </div>
    </div>
  );
}
