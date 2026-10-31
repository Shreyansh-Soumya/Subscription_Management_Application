import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** Handwritten annotation line (Kalam) — the one approved use of the hand font. */
  note?: string;
  action?: ReactNode;
  className?: string;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  note,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center gap-2 border-[1.5px] border-dashed border-rule-strong bg-sheet px-6 py-12 text-center", className)}
    >
      {Icon ? <Icon className="size-6 text-ink-soft" aria-hidden /> : null}
      <p className="text-[15px] font-semibold">{title}</p>
      {description ? (
        <p className="max-w-md text-sm leading-relaxed text-ink-soft">{description}</p>
      ) : null}
      {note ? <p className="hand text-[16px] text-stamp">{note}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
