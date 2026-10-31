import type { InvoiceView } from "@/lib/invoice-queries";

/** The three invoice views, in page-switcher order. */
export const INVOICE_VIEWS: InvoiceView[] = ["outstanding", "overdue", "paid"];

/**
 * Unknown or tampered `?view=` values fall back to `outstanding` instead of
 * reaching the query layer.
 */
export function parseInvoiceView(raw: string | undefined): InvoiceView {
  return raw === "overdue" || raw === "paid" ? raw : "outstanding";
}

/** Trims and bounds the shared `?q=` search filter. */
export function parseSearchQuery(raw: string | undefined): string | undefined {
  const q = raw?.trim().slice(0, 100);
  return q || undefined;
}

/**
 * Invalid or unsafe `?page=` values fall back to page 1, so the query layer's
 * positive-safe-integer guard never sees page input it would have to reject.
 */
export function parsePageNumber(raw: string | undefined): number {
  if (!raw || !/^\d+$/.test(raw.trim())) return 1;
  const page = Number(raw);
  return Number.isSafeInteger(page) && page >= 1 ? page : 1;
}
