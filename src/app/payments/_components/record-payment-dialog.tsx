"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FormField } from "@/components/app/form-field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/money";
import {
  PAYMENT_METHODS,
  buildRecordPaymentPayload,
  type PaymentMethodChoice,
} from "./record-payment-form";

const METHOD_LABELS: Record<PaymentMethodChoice, string> = {
  bank_transfer: "Bank transfer",
  upi: "UPI",
  card: "Card",
  cash: "Cash",
  cheque: "Cheque",
};

type SubmitResult =
  | { kind: "recorded"; balancePaise: number }
  | { kind: "paid" }
  | { kind: "error"; message: string };

export type RecordPaymentDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Business date from the server (`appToday(db)`) — the client never guesses. */
  today: string;
  /** Pre-fill when the dialog is opened from an invoice row. Read on mount. */
  defaultInvoiceNumber?: string;
};

export function RecordPaymentDialog({
  open,
  onOpenChange,
  today,
  defaultInvoiceNumber = "",
}: RecordPaymentDialogProps) {
  const router = useRouter();
  const [invoiceNumber, setInvoiceNumber] = useState(defaultInvoiceNumber);
  const [method, setMethod] = useState<PaymentMethodChoice>("upi");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(today);
  const [note, setNote] = useState("");
  const [fieldError, setFieldError] = useState<{ field: string; message: string } | null>(null);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [pending, setPending] = useState(false);
  /** Synchronous duplicate-submission guard — state updates are not. */
  const submittingRef = useRef(false);

  function reset() {
    setInvoiceNumber(defaultInvoiceNumber);
    setMethod("upi");
    setAmount("");
    setPaidOn(today);
    setNote("");
    setFieldError(null);
    setResult(null);
    setPending(false);
  }

  function handleOpenChange(next: boolean) {
    // Escape, outside-click and the close button all funnel through here:
    // the dialog stays open (and pending) until the request settles.
    if (!next && submittingRef.current) return;
    if (!next) reset();
    onOpenChange(next);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submittingRef.current) return;
    const built = buildRecordPaymentPayload({
      invoiceNumber,
      method,
      amount,
      paidOn,
      note: note || undefined,
    });
    if (!built.ok) {
      setResult(null);
      setFieldError({ field: built.field, message: built.message });
      return;
    }
    setFieldError(null);
    setResult(null);
    setPending(true);
    submittingRef.current = true;
    try {
      const response = await fetch("/api/payments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(built.payload),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
        status?: string;
        balancePaise?: number;
      } | null;
      if (response.ok && body?.status === "paid") {
        setResult({ kind: "paid" });
        setAmount("");
        setNote("");
        router.refresh();
      } else if (
        response.ok &&
        body?.status === "confirmed" &&
        typeof body.balancePaise === "number" &&
        Number.isSafeInteger(body.balancePaise) &&
        body.balancePaise >= 0
      ) {
        setResult({ kind: "recorded", balancePaise: body.balancePaise });
        setAmount("");
        setNote("");
        router.refresh();
      } else {
        setResult({ kind: "error", message: body?.error ?? "Could not record the payment. Try again." });
      }
    } catch {
      setResult({ kind: "error", message: "Could not reach the server. Try again." });
    } finally {
      // Released on every path — success, domain error, network failure.
      setPending(false);
      submittingRef.current = false;
    }
  }

  const errorFor = (field: string) => (fieldError?.field === field ? fieldError.message : undefined);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="headline text-[20px]">Record a payment</DialogTitle>
          <DialogDescription className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft">
            Payment date {today}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="grid gap-4">
          <FormField label="Invoice number" htmlFor="record-payment-invoice" required error={errorFor("invoiceNumber")}>
            <Input
              id="record-payment-invoice"
              value={invoiceNumber}
              onChange={(event) => setInvoiceNumber(event.target.value)}
              placeholder="e.g. INV-000187"
              autoComplete="off"
              disabled={pending}
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Amount (₹)" htmlFor="record-payment-amount" required error={errorFor("amount")} hint="At most two decimals, e.g. 1,250.50">
              <Input
                id="record-payment-amount"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                placeholder="1,250.50"
                autoComplete="off"
                disabled={pending}
              />
            </FormField>
            <FormField label="Method" htmlFor="record-payment-method">
              <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethodChoice)}>
                <SelectTrigger id="record-payment-method" className="w-full" disabled={pending}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((choice) => (
                    <SelectItem key={choice} value={choice}>
                      {METHOD_LABELS[choice]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
          </div>
          <FormField label="Paid on" htmlFor="record-payment-date" required error={errorFor("paidOn")}>
            <Input
              id="record-payment-date"
              type="date"
              value={paidOn}
              max={today}
              onChange={(event) => setPaidOn(event.target.value)}
              disabled={pending}
            />
          </FormField>
          <FormField label="Note" htmlFor="record-payment-note">
            <Textarea
              id="record-payment-note"
              rows={2}
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional note for the receipt"
              disabled={pending}
            />
          </FormField>
          {result?.kind === "error" ? (
            <p className="font-mono text-[11px] text-stamp-red">{result.message}</p>
          ) : null}
          {result?.kind === "recorded" ? (
            <p className="num font-mono text-[12px] font-semibold text-paid">
              Recorded · {formatMoney(result.balancePaise)} still due
            </p>
          ) : null}
          {result?.kind === "paid" ? (
            <p>
              <span className="stamp-badge text-paid">Paid in full</span>
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline-paper" onClick={() => handleOpenChange(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" variant="stamp" disabled={pending}>
              {pending ? "Recording…" : "Record payment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
