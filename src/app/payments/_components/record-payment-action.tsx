"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { RecordPaymentDialog } from "./record-payment-dialog";

export type RecordPaymentActionProps = {
  /** Business date from the server (`appToday(db)`). */
  today: string;
  label?: string;
};

/** Global record-payment trigger for the payments page. */
export function RecordPaymentAction({ today, label = "Record payment" }: RecordPaymentActionProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="stamp" onClick={() => setOpen(true)}>
        {label}
      </Button>
      <RecordPaymentDialog open={open} onOpenChange={setOpen} today={today} />
    </>
  );
}
