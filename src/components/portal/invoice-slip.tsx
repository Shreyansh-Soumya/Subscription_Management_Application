import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import type { InvoiceComputation } from "@/lib/compute-invoice";
import { cn } from "@/lib/utils";

function Row({ label, amount, tone }: { label: string; amount: string; tone?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 border-b border-rule py-1.5 text-[14px]", tone)}>
      <span className="min-w-0">{label}</span>
      <span className="num shrink-0">{amount}</span>
    </div>
  );
}

/**
 * The next invoice as a paper slip, ruled like a register page. Every figure comes straight
 * from computeInvoice, the same calculation the billing run uses.
 */
export function InvoiceSlip({
  computation,
  billingDate,
  title = "Next invoice",
  previousTotalPaise,
  isUpdating,
  className,
}: {
  computation: InvoiceComputation;
  billingDate: string;
  title?: string;
  /** Shown struck through when a change would alter the total. */
  previousTotalPaise?: number;
  isUpdating?: boolean;
  className?: string;
}) {
  const changed = previousTotalPaise !== undefined && previousTotalPaise !== computation.totalPaise;
  return (
    <section
      aria-label={title}
      aria-busy={isUpdating}
      className={cn(
        "relative border-[1.5px] border-ink bg-sheet py-5 pr-5 pl-9 shadow-[6px_6px_0_var(--ink)] transition-opacity",
        "before:absolute before:inset-y-0 before:left-5 before:border-l-[1.5px] before:border-margin",
        isUpdating && "opacity-60",
        className,
      )}
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="headline text-[22px]">{title}</h2>
        <p className="num text-[13px] text-ink-soft">{formatDate(billingDate)}</p>
      </div>

      <div className="mt-3">
        {computation.lines.map((line) => (
          <Row
            key={`${line.productId}-${line.description}`}
            label={`${line.description} × ${line.quantity.toLocaleString("en-IN")}`}
            amount={formatMoney(line.subtotalPaise)}
          />
        ))}
        {computation.appliedDiscounts.map((discount) => (
          <Row key={discount.id} label={discount.name} amount={`−${formatMoney(discount.amountPaise)}`} tone="text-paid" />
        ))}
        {computation.taxes.map((tax) => (
          <Row key={tax.id} label={tax.name} amount={formatMoney(tax.amountPaise)} />
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <span className="text-[14px] font-semibold">Total</span>
        <span className="flex flex-wrap items-baseline justify-end gap-x-3">
          {changed && <s className="num text-[15px] text-ink-soft" aria-label={`Currently ${formatMoney(previousTotalPaise)}`}>{formatMoney(previousTotalPaise)}</s>}
          <strong className="headline num text-[38px] sm:text-[44px]" aria-live="polite">{formatMoney(computation.totalPaise)}</strong>
        </span>
      </div>
    </section>
  );
}
