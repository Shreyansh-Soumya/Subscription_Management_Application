"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, type TableColumn } from "@/components/app/data-table";
import { Button } from "@/components/ui/button";
import { countOf } from "@/lib/format";
import { formatMoney } from "@/lib/money";

type Skip = { subscriptionId: string; number: string; reason: string };
type RunTotals = { processed: number; created: number; billedPaise: number; skipped: Skip[]; failed: Skip[] };

const SKIP_COLUMNS: TableColumn<Skip>[] = [
  { key: "number", header: "Subscription", cell: (row) => row.number },
  { key: "reason", header: "Reason", cell: (row) => row.reason },
];

async function post(path: string, body: object = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "This stopped part way. Run it again to continue.");
  return result;
}

function Progress({ label, done, total }: { label: string; done: number; total: number }) {
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 100;
  return (
    <div className="mt-4 max-w-xl">
      <p className="text-sm font-medium" aria-live="polite">{label}: {done.toLocaleString("en-IN")} of {total.toLocaleString("en-IN")}</p>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="mt-2 h-3 border border-rule-strong">
        <div className="h-full bg-stamp transition-[width]" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

export function BillingPanel({ due, drafts }: { due: number; drafts: number }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);
  const [totals, setTotals] = useState<RunTotals | null>(null);
  const [runTotal, setRunTotal] = useState(0);
  const [confirming, setConfirming] = useState(false);
  const [confirmed, setConfirmed] = useState<{ count: number; failed: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const busy = running || confirming;

  const runBilling = async () => {
    setRunning(true);
    setError("");
    setConfirmed(null);
    setRunTotal(due);
    const sum: RunTotals = { processed: 0, created: 0, billedPaise: 0, skipped: [], failed: [] };
    setTotals({ ...sum });
    try {
      let cursor: string | undefined;
      for (;;) {
        const batch = await post("/api/billing/run", cursor ? { cursor } : {});
        sum.processed += batch.processed;
        sum.created += batch.created;
        sum.billedPaise += batch.billedPaise;
        sum.skipped.push(...batch.skipped);
        sum.failed.push(...batch.failed);
        setTotals({ ...sum, skipped: [...sum.skipped], failed: [...sum.failed] });
        cursor = batch.cursor;
        if (!batch.hasMore) break;
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This stopped part way. Run it again to continue.");
    } finally {
      setRunning(false);
      router.refresh();
    }
  };

  const confirmAll = async () => {
    setConfirming(true);
    setError("");
    const state = { count: 0, failed: 0, total: drafts };
    setConfirmed({ ...state });
    try {
      for (;;) {
        const batch = await post("/api/billing/confirm-drafts");
        state.count += batch.confirmed;
        state.failed += batch.failed.length;
        setConfirmed({ ...state });
        // Stop if a batch makes no progress, so a stuck invoice can't loop forever.
        if (!batch.hasMore || batch.confirmed === 0) break;
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This stopped part way. Run it again to continue.");
    } finally {
      setConfirming(false);
      router.refresh();
    }
  };

  return (
    <div className="mt-6 grid gap-8">
      <section aria-labelledby="run-title">
        <h2 id="run-title" className="text-lg font-semibold">{countOf(due, "subscription")} due</h2>
        <Button className="mt-3" disabled={busy} onClick={runBilling}>{running ? "Running billing..." : "Run billing"}</Button>
        {totals && <Progress label="Subscriptions checked" done={totals.processed} total={runTotal} />}
        {totals && !running && (
          <div role="status" className="mt-5 max-w-3xl">
            <p className="text-[15px] font-semibold">
              {countOf(totals.created, "new invoice")}, totalling {formatMoney(totals.billedPaise)}.
            </p>
            {totals.created === 0 && totals.failed.length === 0 && (
              <p className="mt-1 text-sm text-ink-soft">Nothing new to bill.</p>
            )}
          </div>
        )}
        {totals && totals.failed.length > 0 && (
          <div className="mt-5 max-w-3xl">
            <h3 className="font-semibold text-stamp-red">{totals.failed.length} failed and stay due for the next run</h3>
            <DataTable className="mt-2" columns={SKIP_COLUMNS} rows={totals.failed} rowKey={(row) => row.subscriptionId} />
          </div>
        )}
        {totals && totals.skipped.length > 0 && (
          <div className="mt-5 max-w-3xl">
            <h3 className="font-semibold">{totals.skipped.length} skipped</h3>
            <DataTable className="mt-2" columns={SKIP_COLUMNS} rows={totals.skipped.slice(0, 50)} rowKey={(row) => `${row.subscriptionId}-${row.reason}`} />
            {totals.skipped.length > 50 && <p className="mt-2 text-sm text-ink-soft">Showing the first 50.</p>}
          </div>
        )}
      </section>

      <section aria-labelledby="confirm-title" className="border-t border-rule pt-6">
        <h2 id="confirm-title" className="text-lg font-semibold">{countOf(drafts, "draft invoice")}</h2>
        <p className="mt-1 text-sm text-ink-soft">Confirmed invoices can be paid, and count as overdue after their due date.</p>
        <Button className="mt-3" variant="outline" disabled={busy || drafts === 0} onClick={confirmAll}>
          {confirming ? "Confirming..." : "Confirm all"}
        </Button>
        {confirmed && <Progress label="Invoices confirmed" done={confirmed.count} total={confirmed.total} />}
        {confirmed && confirmed.failed > 0 && (
          <p role="alert" className="mt-3 text-sm font-semibold text-stamp-red">{confirmed.failed} couldn&apos;t be confirmed and are still drafts.</p>
        )}
      </section>

      {error && <p role="alert" className="max-w-xl border border-stamp-red p-3 text-sm text-stamp-red">{error}</p>}
    </div>
  );
}
