import { Badge } from "@/components/ui/badge";
import type { InvoiceStatus, SubscriptionStatus } from "@/lib/status";
import { cn } from "@/lib/utils";

/**
 * Status → token mapping per plan §D:
 * success = --paid, warning = --due, accent = --stamp, danger = --stamp-red,
 * neutral = --rule-strong/--ink-soft.
 */
const STATUS_TONES: Record<SubscriptionStatus | InvoiceStatus, string> = {
  draft: "border-rule-strong text-ink-soft",
  quotation: "border-due text-due",
  confirmed: "border-stamp text-stamp",
  active: "border-paid text-paid",
  paused: "border-due text-due",
  closed: "border-rule-strong text-ink-soft",
  paid: "border-paid text-paid",
  cancelled: "border-stamp-red text-stamp-red",
};

type StatusBadgeProps = {
  status: SubscriptionStatus | InvoiceStatus;
  className?: string;
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "border-[1.5px] bg-transparent font-mono text-[10px] font-semibold uppercase tracking-[0.08em]",
        STATUS_TONES[status],
        className,
      )}
    >
      {status}
    </Badge>
  );
}
