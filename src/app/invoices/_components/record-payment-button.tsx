"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RecordPaymentDialog } from "@/app/payments/_components/record-payment-dialog";

export type RecordPaymentButtonProps = {
  /** Business date from the server (`appToday(db)`). */
  today: string;
  /** Pre-fills the dialog when opened from an invoice row. */
  invoiceNumber?: string;
  label?: string;
};

/** Row-action trigger for the record-payment dialog (isolated; wiring in M3). */
export function RecordPaymentButton({ today, invoiceNumber, label = "Record payment" }: RecordPaymentButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="stamp" size="xs" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <RecordPaymentDialog open={open} onOpenChange={setOpen} today={today} defaultInvoiceNumber={invoiceNumber} />
    </>
  );
}
