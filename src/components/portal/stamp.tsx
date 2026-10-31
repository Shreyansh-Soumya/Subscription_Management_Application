import { cn } from "@/lib/utils";

const TONES = {
  active: "text-paid",
  paid: "text-paid",
  overdue: "text-stamp-red",
  cancelled: "text-stamp-red",
  paused: "text-due",
  due: "text-due",
  quotation: "text-stamp",
  confirmed: "text-stamp",
  closed: "text-ink-soft",
} as const;

export type StampTone = keyof typeof TONES;

/** An ink stamp, like the ones on a paper register. It's the portal's one piece of decoration, so it always carries a status. */
export function Stamp({ tone, children, large, className }: { tone: StampTone; children: React.ReactNode; large?: boolean; className?: string }) {
  return (
    <span className={cn("stamp-badge shrink-0 whitespace-nowrap", TONES[tone], large ? "-rotate-6 text-[22px]" : "text-[11px]", className)}>
      {children}
    </span>
  );
}

export function subscriptionTone(status: string): StampTone {
  return status in TONES ? (status as StampTone) : "closed";
}

/** What to stamp on an invoice. A part-paid invoice is still due, so it says so. */
export function invoiceStamp(invoice: { status: string; isOverdue: boolean }): { tone: StampTone; label: string } {
  if (invoice.status === "paid") return { tone: "paid", label: "Paid" };
  if (invoice.status === "cancelled") return { tone: "cancelled", label: "Cancelled" };
  if (invoice.isOverdue) return { tone: "overdue", label: "Overdue" };
  return { tone: "due", label: "Due" };
}
