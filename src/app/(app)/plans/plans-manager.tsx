"use client";

import { Layers } from "lucide-react";
import { useState } from "react";
import { CheckboxField, ConfirmDelete, PageLinks, ResultBanner } from "@/components/app/catalog-kit";
import { DataTable, type TableColumn } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { FormField } from "@/components/app/form-field";
import { useCatalogRequest } from "@/components/app/use-catalog-request";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fieldErrorsOf, planSchema } from "@/lib/catalog-validation";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { rupeesToPaise } from "@/lib/rupees";

type Plan = {
  id: string;
  name: string;
  pricePaise: number;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  minQuantity: number;
  availableFrom: string | null;
  availableTo: string | null;
  autoClose: boolean;
  canCloseEarly: boolean;
  canPause: boolean;
  canRenew: boolean;
};

const EMPTY_FORM = {
  name: "",
  price: "",
  frequency: "monthly" as Plan["frequency"],
  minQuantity: "1",
  availableFrom: "",
  availableTo: "",
  autoClose: false,
  canCloseEarly: true,
  canPause: true,
  canRenew: true,
};

function availability(plan: Plan): string {
  if (plan.availableFrom && plan.availableTo) return `${formatDate(plan.availableFrom)} to ${formatDate(plan.availableTo)}`;
  if (plan.availableFrom) return `From ${formatDate(plan.availableFrom)}`;
  if (plan.availableTo) return `Until ${formatDate(plan.availableTo)}`;
  return "Always";
}

function allowed(plan: Plan): string {
  const options = [
    plan.autoClose && "Closes itself",
    plan.canCloseEarly && "Close early",
    plan.canPause && "Pause",
    plan.canRenew && "Renew",
  ].filter(Boolean);
  return options.join(", ") || "None";
}

export function PlansManager({ rows, total, page, pageSize }: { rows: Plan[]; total: number; page: number; pageSize: number }) {
  const request = useCatalogRequest();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleting, setDeleting] = useState<Plan | null>(null);

  const open = (plan: Plan | null) => {
    request.reset();
    setEditingId(plan?.id ?? null);
    setForm(
      plan
        ? {
            ...plan,
            price: (plan.pricePaise / 100).toFixed(2),
            minQuantity: String(plan.minQuantity),
            availableFrom: plan.availableFrom ?? "",
            availableTo: plan.availableTo ?? "",
          }
        : EMPTY_FORM,
    );
    setFormOpen(true);
  };

  const save = async () => {
    const parsed = planSchema.safeParse({
      name: form.name,
      pricePaise: rupeesToPaise(form.price) ?? undefined,
      frequency: form.frequency,
      minQuantity: form.minQuantity.trim() === "" ? undefined : Number(form.minQuantity),
      availableFrom: form.availableFrom || null,
      availableTo: form.availableTo || null,
      autoClose: form.autoClose,
      canCloseEarly: form.canCloseEarly,
      canPause: form.canPause,
      canRenew: form.canRenew,
    });
    if (!parsed.success) return request.showProblems(fieldErrorsOf(parsed.error));

    const saved = await request.send(
      editingId ? `/api/plans/${editingId}` : "/api/plans",
      editingId ? "PUT" : "POST",
      parsed.data,
      editingId ? "Plan updated." : "Plan added.",
    );
    if (saved) setFormOpen(false);
  };

  const remove = async () => {
    if (!deleting) return;
    const { id } = deleting;
    setDeleting(null);
    await request.send(`/api/plans/${id}`, "DELETE", undefined, "Plan deleted.");
  };

  const columns: TableColumn<Plan>[] = [
    { key: "name", header: "Plan", cell: (row) => <span className="font-medium">{row.name}</span> },
    { key: "price", header: "Price", align: "right", cell: (row) => <span className="num font-mono">{formatMoney(row.pricePaise)}</span> },
    { key: "frequency", header: "Bills", cell: (row) => <span className="capitalize">{row.frequency}</span> },
    { key: "min", header: "Min. qty", align: "right", cell: (row) => <span className="num font-mono">{row.minQuantity}</span> },
    { key: "available", header: "Available", cell: availability },
    { key: "options", header: "Options", cell: allowed },
    {
      key: "actions",
      header: "Actions",
      cell: (row) => (
        <span className="flex gap-1">
          <Button size="sm" variant="outline-paper" onClick={() => open(row)}>Edit</Button>
          <Button size="sm" variant="outline-paper" onClick={() => setDeleting(row)}>Delete</Button>
        </span>
      ),
    },
  ];

  return (
    <div className="mt-6 grid gap-4">
      <div>
        <Button variant="stamp" onClick={() => open(null)}>Add plan</Button>
      </div>
      {!formOpen ? <ResultBanner error={request.error} notice={request.notice} /> : null}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        emptyState={<EmptyState icon={Layers} title="No plans yet" description="Add a plan so subscriptions have something to bill on." />}
      />
      <PageLinks path="/plans" page={page} total={total} pageSize={pageSize} />

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="w-full overflow-y-auto p-5 sm:max-w-lg">
          <SheetHeader className="p-0">
            <SheetTitle>{editingId ? "Edit plan" : "Add plan"}</SheetTitle>
            <SheetDescription>Decide what this plan allows. The billing engine follows these settings.</SheetDescription>
          </SheetHeader>
          <form
            className="mt-4 grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <ResultBanner error={request.error} />
            <FormField label="Name" htmlFor="plan-name" required error={request.fields.name?.[0]}>
              <Input id="plan-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Price (₹)" htmlFor="plan-price" required error={request.fields.pricePaise?.[0]}>
                <Input id="plan-price" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </FormField>
              <FormField label="Bills" htmlFor="plan-frequency" required error={request.fields.frequency?.[0]}>
                <Select value={form.frequency} onValueChange={(frequency) => setForm({ ...form, frequency: frequency as Plan["frequency"] })}>
                  <SelectTrigger id="plan-frequency" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Min. quantity" htmlFor="plan-min" required error={request.fields.minQuantity?.[0]}>
                <Input id="plan-min" inputMode="numeric" value={form.minQuantity} onChange={(e) => setForm({ ...form, minQuantity: e.target.value })} />
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Available from" htmlFor="plan-from" error={request.fields.availableFrom?.[0]}>
                <Input id="plan-from" type="date" value={form.availableFrom} onChange={(e) => setForm({ ...form, availableFrom: e.target.value })} />
              </FormField>
              <FormField label="Available to" htmlFor="plan-to" error={request.fields.availableTo?.[0]}>
                <Input id="plan-to" type="date" value={form.availableTo} onChange={(e) => setForm({ ...form, availableTo: e.target.value })} />
              </FormField>
            </div>
            <div className="grid gap-2">
              <CheckboxField id="plan-auto" label="Closes on its own when it ends" checked={form.autoClose} onChange={(autoClose) => setForm({ ...form, autoClose })} />
              <CheckboxField id="plan-early" label="Can be closed early" checked={form.canCloseEarly} onChange={(canCloseEarly) => setForm({ ...form, canCloseEarly })} />
              <CheckboxField id="plan-pause" label="Can be paused" checked={form.canPause} onChange={(canPause) => setForm({ ...form, canPause })} />
              <CheckboxField id="plan-renew" label="Can be renewed" checked={form.canRenew} onChange={(canRenew) => setForm({ ...form, canRenew })} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="stamp" disabled={request.busy}>{request.busy ? "Saving..." : "Save plan"}</Button>
              <Button type="button" variant="outline-paper" onClick={() => setFormOpen(false)}>Cancel</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <ConfirmDelete
        title={deleting ? `Delete ${deleting.name}?` : null}
        description="A plan already on a subscription or quotation template can't be deleted."
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
