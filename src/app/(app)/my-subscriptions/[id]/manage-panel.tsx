"use client";

import { useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { InvoiceSlip } from "@/components/portal/invoice-slip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatMoney } from "@/lib/money";
import type { PortalChange, PortalPreview, PortalSubscriptionDetail } from "@/lib/portal";

type Draft = { quantities: Record<string, number>; addAddons: string[]; removeLines: string[] };
const EMPTY: Draft = { quantities: {}, addAddons: [], removeLines: [] };

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

const messageOf = (caught: unknown) => (caught instanceof Error ? caught.message : "That didn't work. Try again.");

export function ManagePanel({ detail }: { detail: PortalSubscriptionDetail }) {
  const router = useRouter();
  const base = `/api/portal/subscriptions/${detail.id}`;
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [preview, setPreview] = useState<PortalPreview | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(0);

  const toChange = (next: Draft): PortalChange | null => {
    const quantities = Object.fromEntries(
      Object.entries(next.quantities).filter(([lineId, quantity]) => detail.lines.find((line) => line.lineId === lineId)?.quantity !== quantity),
    );
    const isEmpty = Object.keys(quantities).length === 0 && next.addAddons.length === 0 && next.removeLines.length === 0;
    return isEmpty ? null : { quantities, addAddons: next.addAddons, removeLines: next.removeLines };
  };

  const change = toChange(draft);

  /** Every edit re-prices the slip. Only the newest answer counts, so a slow response can't overwrite a newer one. */
  const edit = (next: Draft) => {
    setDraft(next);
    setSaved("");
    setError("");
    clearTimeout(timer.current);
    const request = ++latest.current;
    const nextChange = toChange(next);
    if (!nextChange) {
      setPreview(null);
      setIsPreviewing(false);
      return;
    }
    setIsPreviewing(true);
    timer.current = setTimeout(async () => {
      try {
        const result = await post(`${base}/preview`, nextChange);
        if (request !== latest.current) return;
        setPreview(result);
      } catch (caught) {
        if (request !== latest.current) return;
        setPreview(null);
        setError(messageOf(caught));
      }
      setIsPreviewing(false);
    }, 200);
  };

  const quantityOf = (line: { lineId: string; quantity: number }) => draft.quantities[line.lineId] ?? line.quantity;
  const setQuantity = (lineId: string, quantity: number) => edit({ ...draft, quantities: { ...draft.quantities, [lineId]: quantity } });

  const confirmChange = async () => {
    if (!change || !preview) return;
    clearTimeout(timer.current);
    latest.current += 1; // so a preview still on its way can't overwrite the saved result
    setIsSaving(true);
    setError("");
    try {
      const result: PortalPreview = await post(`${base}/change`, { change, expectedTotalPaise: preview.next.totalPaise });
      setDraft(EMPTY);
      setPreview(null);
      setSaved(`Saved. Your next invoice will be ${formatMoney(result.next.totalPaise)}.`);
      router.refresh();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setIsSaving(false);
    }
  };

  const setPaused = async (action: "pause" | "resume") => {
    const question =
      action === "pause"
        ? "Pause this subscription? Anything already due is invoiced first, and no new invoices are created while it's paused."
        : "Resume this subscription? You're invoiced for the billing period you resume in. Whole periods spent paused aren't charged.";
    if (!window.confirm(question)) return;
    setIsSaving(true);
    setError("");
    setSaved("");
    try {
      await post(`${base}/${action}`);
      setSaved(action === "pause" ? "Paused." : "Resumed.");
      router.refresh();
    } catch (caught) {
      setError(messageOf(caught));
    } finally {
      setIsSaving(false);
    }
  };

  const seatLines = detail.lines.filter((line) => !line.isAddon);
  const addonLine = (productId: string) => detail.lines.find((line) => line.productId === productId);
  const isPaused = detail.status === "paused";
  const billingDate = preview?.billingDate ?? detail.nextInvoice!.billingDate;

  return (
    <div className="mt-8 grid items-start gap-10 lg:grid-cols-[1fr_minmax(0,440px)]">
      <div className="grid min-w-0 gap-8">
        <fieldset disabled={isSaving} className="contents">
        <section aria-labelledby="seats-title">
          <h2 id="seats-title" className="text-lg font-semibold">Seats</h2>
          {detail.minQuantity > 1 && <p className="mt-0.5 text-sm text-ink-soft">This plan needs at least {detail.minQuantity} seats.</p>}
          <ul className="mt-2 border-t-[1.5px] border-ink">
            {seatLines.map((line) => {
              const quantity = quantityOf(line);
              return (
                <li key={line.lineId} className="flex flex-wrap items-center justify-between gap-3 border-b border-rule-strong py-3">
                  <span className="min-w-0">
                    <label htmlFor={`qty-${line.lineId}`} className="block font-medium">{line.description}</label>
                    <span className="num block text-[13px] text-ink-soft">{formatMoney(line.unitPricePaise)} each</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Button type="button" variant="outline" size="icon" aria-label={`Remove one from ${line.description}`} disabled={quantity <= (seatLines.length === 1 ? Math.max(1, detail.minQuantity) : 1)} onClick={() => setQuantity(line.lineId, quantity - 1)}><Minus aria-hidden /></Button>
                    <Input
                      id={`qty-${line.lineId}`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={quantity || ""}
                      onChange={(e) => setQuantity(line.lineId, Number.parseInt(e.target.value, 10) || 0)}
                      className="num h-9 w-20 text-center"
                    />
                    <Button type="button" variant="outline" size="icon" aria-label={`Add one to ${line.description}`} onClick={() => setQuantity(line.lineId, quantity + 1)}><Plus aria-hidden /></Button>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>

        {detail.addons.length > 0 && (
          <section aria-labelledby="addons-title">
            <h2 id="addons-title" className="text-lg font-semibold">Add-ons</h2>
            <ul className="mt-2 border-t-[1.5px] border-ink">
              {detail.addons.map((addon) => {
                const existing = addonLine(addon.id);
                const isOn = existing ? !draft.removeLines.includes(existing.lineId) : draft.addAddons.includes(addon.id);
                const toggle = () =>
                  existing
                    ? edit({ ...draft, removeLines: isOn ? [...draft.removeLines, existing.lineId] : draft.removeLines.filter((id) => id !== existing.lineId) })
                    : edit({ ...draft, addAddons: isOn ? draft.addAddons.filter((id) => id !== addon.id) : [...draft.addAddons, addon.id] });
                return (
                  <li key={addon.id} className="border-b border-rule-strong">
                    <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
                      <span className="min-w-0">
                        <span className="block font-medium">{addon.name}</span>
                        <span className="num block text-[13px] text-ink-soft">{formatMoney(addon.salesPricePaise)} each invoice, before tax</span>
                      </span>
                      <input type="checkbox" checked={isOn} onChange={toggle} className="size-5 shrink-0 accent-[var(--stamp)]" />
                    </label>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        </fieldset>

        <section aria-labelledby="pause-title">
          <h2 id="pause-title" className="text-lg font-semibold">{isPaused ? "Paused" : "Pause"}</h2>
          {isPaused ? (
            <>
              <p className="mt-0.5 max-w-lg text-sm text-ink-soft">No new invoices are created while this is paused. The slip shows what you&apos;d pay next if you resume now.</p>
              <Button className="mt-3" variant="outline" disabled={isSaving} onClick={() => setPaused("resume")}>Resume subscription</Button>
            </>
          ) : detail.canPause ? (
            <>
              <p className="mt-0.5 max-w-lg text-sm text-ink-soft">Stop new invoices until you resume. Whole billing periods spent paused aren&apos;t charged.</p>
              <Button className="mt-3" variant="outline" disabled={isSaving} onClick={() => setPaused("pause")}>Pause subscription</Button>
            </>
          ) : (
            <p className="mt-0.5 text-sm text-ink-soft">This plan can&apos;t be paused.</p>
          )}
        </section>
      </div>

      <div className="grid gap-4 lg:sticky lg:top-20">
        <InvoiceSlip
          computation={preview?.next ?? detail.nextInvoice!.computation}
          billingDate={billingDate}
          title={preview ? "Your new invoice" : "Next invoice"}
          previousTotalPaise={preview?.current.totalPaise}
          isUpdating={isPreviewing}
        />
        {error && <p role="alert" className="border border-stamp-red p-3 text-sm text-stamp-red">{error}</p>}
        {saved && <p role="status" className="border border-paid p-3 text-sm font-medium text-paid">{saved}</p>}
        {change && (
          <div>
            <Button size="lg" className="w-full" disabled={!preview || isPreviewing || isSaving} onClick={confirmChange}>
              {isSaving ? "Saving..." : "Confirm change"}
            </Button>
            <p className="mt-2 text-sm text-ink-soft">This starts with your next invoice. Invoices you already have stay the same.</p>
            <Button variant="ghost" className="mt-1" disabled={isSaving} onClick={() => edit(EMPTY)}>Discard change</Button>
          </div>
        )}
      </div>
    </div>
  );
}
