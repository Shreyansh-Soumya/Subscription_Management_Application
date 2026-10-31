"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { countOf, formatDate } from "@/lib/format";

type JumpSummary = {
  to: string;
  closed: unknown[];
  needsRenewal: unknown[];
  needsClosing: unknown[];
  failed: unknown[];
  invoicesCreated: number;
  newlyOverdue: number;
};

export function TimeMachineForm({ today, isSimulated }: { today: string; isSimulated: boolean }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState<JumpSummary | null>(null);

  const send = async (body: object) => {
    setBusy(true);
    setError("");
    setSummary(null);
    try {
      const response = await fetch("/api/admin/time-machine", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "The date couldn't be changed. Try again.");
        return;
      }
      if (!result.returned) setSummary(result);
      setDate("");
      router.refresh();
    } catch {
      setError("The date couldn't be changed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const jump = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    send({ date });
  };

  const returnToReal = () => {
    if (window.confirm("Return to the real date? Anything created while jumping stays as it is, so some records may be dated in the future.")) {
      send({ returnToRealDate: true });
    }
  };

  return (
    <div className="mt-6 max-w-xl">
      <form onSubmit={jump} className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor="jump-date">Jump to</Label>
          <Input
            id="jump-date"
            type="date"
            value={date}
            min={today}
            onChange={(e) => setDate(e.target.value)}
            required
            className="w-48"
          />
        </div>
        <Button type="submit" disabled={busy || !date}>{busy ? "Moving..." : "Jump to this date"}</Button>
        {isSimulated && (
          <Button type="button" variant="outline" disabled={busy} onClick={returnToReal}>Return to the real date</Button>
        )}
      </form>

      {error && <p role="alert" className="mt-4 border border-stamp-red p-3 text-sm text-stamp-red">{error}</p>}

      {summary && (
        <section aria-label="What changed" role="status" className="mt-6 border-[1.5px] border-rule-strong bg-sheet p-4">
          <h2 className="font-semibold">Now on {formatDate(summary.to)}</h2>
          <ul className="mt-3 grid gap-1.5 text-sm">
            <li>{countOf(summary.closed.length, "plan")} closed automatically</li>
            <li>{countOf(summary.invoicesCreated, "final invoice")} created before closing</li>
            <li>{countOf(summary.newlyOverdue, "invoice")} became overdue</li>
            <li>{countOf(summary.needsRenewal.length, "subscription")} ready to renew</li>
            <li>{countOf(summary.needsClosing.length, "subscription")} ended, needing closing</li>
            {summary.failed.length > 0 && (
              <li className="font-semibold text-stamp-red">{summary.failed.length} subscriptions couldn&apos;t be closed. Check the logs.</li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
}
