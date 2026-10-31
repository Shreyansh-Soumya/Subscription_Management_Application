"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { useRouter } from "next/navigation";
import { EmptyState } from "@/components/app/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import type { OpenInvoice } from "@/lib/bank-matching";
import type { BankSuggestion } from "@/lib/bank-statements";
import { countOf, formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";

type ImportResult = {
  imported: number;
  duplicates: number;
  debitsSkipped: number;
  errors: { lineNumber: number; message: string }[];
};

const MAX_FILE_BYTES = 2_000_000;

async function post(path: string, body: object = {}) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "That didn't work. Try again.");
  return result;
}

function LineRow({ line, invoices }: { line: BankSuggestion; invoices: OpenInvoice[] }) {
  const router = useRouter();
  const [invoiceId, setInvoiceId] = useState(line.invoiceId ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const selectId = `invoice-${line.lineId}`;

  // Close alternatives first, then every other invoice this payment could cover.
  const fits = invoices.filter((invoice) => invoice.balancePaise >= line.amountPaise);
  const options = [...fits].sort(
    (a, b) => Number(line.alternatives.includes(b.id)) - Number(line.alternatives.includes(a.id)),
  );

  const act = async (action: "confirm" | "ignore") => {
    setBusy(true);
    setError("");
    try {
      await post(`/api/bank-statements/lines/${line.lineId}/${action}`, action === "confirm" ? { invoiceId } : {});
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That didn't work. Try again.");
      setBusy(false);
    }
  };

  return (
    <li className="grid gap-3 border-b border-rule py-4 md:grid-cols-[1fr_minmax(240px,320px)_auto] md:items-start">
      <div className="min-w-0">
        <p className="font-semibold">{formatMoney(line.amountPaise)} <span className="font-normal text-ink-soft">on {formatDate(line.bookedOn)}</span></p>
        <p className="mt-0.5 text-sm break-words">{line.description || "No description"}{line.reference ? ` (ref ${line.reference})` : ""}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          {line.confidence && <Badge variant="outline">{line.confidence === "high" ? "Strong match" : "Likely match"}</Badge>}
          {line.reason}
        </p>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor={selectId}>Invoice</Label>
        <select
          id={selectId}
          value={invoiceId}
          onChange={(e) => setInvoiceId(e.target.value)}
          className="h-9 w-full min-w-0 border border-input bg-transparent px-2 text-sm"
        >
          <option value="">Choose an invoice</option>
          {options.map((invoice) => (
            <option key={invoice.id} value={invoice.id}>
              {invoice.number}, {invoice.customerName}, {formatMoney(invoice.balancePaise)} left
            </option>
          ))}
        </select>
      </div>
      <div className="flex gap-2 md:pt-6">
        <Button disabled={busy || !invoiceId} onClick={() => act("confirm")}>Confirm</Button>
        <Button variant="outline" disabled={busy} onClick={() => act("ignore")}>Set aside</Button>
      </div>
      {error && <p role="alert" className="text-sm text-stamp-red md:col-span-3">{error}</p>}
    </li>
  );
}

export function BankMatcher({ lines, invoices }: { lines: BankSuggestion[]; invoices: OpenInvoice[] }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError("");
    setResult(null);
    if (file.size > MAX_FILE_BYTES) {
      setError("This file is too large. Upload up to 2 MB.");
      return;
    }
    setUploading(true);
    try {
      setResult(await post("/api/bank-statements", { csv: await file.text() }));
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This file couldn't be read. Try again.");
    } finally {
      setUploading(false);
      if (input.current) input.current.value = "";
    }
  };

  return (
    <div className="mt-6 grid gap-6">
      <div>
        <Label htmlFor="statement">Bank statement (CSV)</Label>
        <input
          ref={input}
          id="statement"
          type="file"
          accept=".csv,text/csv"
          disabled={uploading}
          onChange={upload}
          className="mt-1.5 block max-w-full text-sm"
        />
        {uploading && <p role="status" className="mt-2 text-sm">Reading the statement...</p>}
        {error && <p role="alert" className="mt-3 max-w-xl border border-stamp-red p-3 text-sm text-stamp-red">{error}</p>}
        {result && (
          <div role="status" className="mt-3 max-w-xl text-sm">
            <p className="font-semibold">{countOf(result.imported, "credit")} added</p>
            <p className="text-ink-soft">{result.duplicates} already uploaded, {countOf(result.debitsSkipped, "debit")} skipped.</p>
            {result.errors.length > 0 && (
              <ul className="mt-2 grid gap-1 text-stamp-red">
                {result.errors.slice(0, 10).map((row) => <li key={row.lineNumber}>Line {row.lineNumber}: {row.message}</li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      <section aria-labelledby="pending-title">
        <h2 id="pending-title" className="text-lg font-semibold">{lines.length} waiting for a decision</h2>
        {lines.length === 0 ? (
          <EmptyState className="mt-3" title="Nothing to match" description="Upload a statement to see its credits here." />
        ) : (
          <ul className="mt-1">{lines.map((line) => <LineRow key={line.lineId} line={line} invoices={invoices} />)}</ul>
        )}
      </section>
    </div>
  );
}
