"use client";

import { Receipt } from "lucide-react";
import { useState } from "react";
import { CheckboxField, ConfirmDelete, PageLinks, ResultBanner } from "@/components/app/catalog-kit";
import { DataTable, type TableColumn } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { FormField } from "@/components/app/form-field";
import { useCatalogRequest } from "@/components/app/use-catalog-request";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fieldErrorsOf, taxRuleSchema } from "@/lib/catalog-validation";
import { rupeesToPaise } from "@/lib/rupees";

type TaxRule = { id: string; name: string; rateBps: number; active: boolean };

const EMPTY_FORM = { name: "", rate: "", active: true };

export function TaxesManager({ rows, total, page, pageSize }: { rows: TaxRule[]; total: number; page: number; pageSize: number }) {
  const request = useCatalogRequest();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleting, setDeleting] = useState<TaxRule | null>(null);

  const open = (rule: TaxRule | null) => {
    request.reset();
    setEditingId(rule?.id ?? null);
    setForm(rule ? { name: rule.name, rate: String(rule.rateBps / 100), active: rule.active } : EMPTY_FORM);
    setFormOpen(true);
  };

  const save = async () => {
    const parsed = taxRuleSchema.safeParse({
      name: form.name,
      // Two decimal places of a percent are whole basis points, the same exact conversion as rupees to paise.
      rateBps: rupeesToPaise(form.rate) ?? undefined,
      active: form.active,
    });
    if (!parsed.success) return request.showProblems(fieldErrorsOf(parsed.error));

    const saved = await request.send(
      editingId ? `/api/taxes/${editingId}` : "/api/taxes",
      editingId ? "PUT" : "POST",
      parsed.data,
      editingId ? "Tax rule updated." : "Tax rule added.",
    );
    if (saved) setFormOpen(false);
  };

  const remove = async () => {
    if (!deleting) return;
    const { id } = deleting;
    setDeleting(null);
    await request.send(`/api/taxes/${id}`, "DELETE", undefined, "Tax rule deleted.");
  };

  const columns: TableColumn<TaxRule>[] = [
    { key: "name", header: "Tax", cell: (row) => <span className="font-medium">{row.name}</span> },
    { key: "rate", header: "Rate", align: "right", cell: (row) => <span className="num font-mono">{row.rateBps / 100}%</span> },
    { key: "active", header: "Offered on products", cell: (row) => (row.active ? "Yes" : "No") },
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
        <Button variant="stamp" onClick={() => open(null)}>Add tax rule</Button>
      </div>
      {!formOpen ? <ResultBanner error={request.error} notice={request.notice} /> : null}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        emptyState={<EmptyState icon={Receipt} title="No tax rules yet" description="Add a rate such as GST 18%." />}
      />
      <PageLinks path="/taxes" page={page} total={total} pageSize={pageSize} />

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="w-full overflow-y-auto p-5 sm:max-w-md">
          <SheetHeader className="p-0">
            <SheetTitle>{editingId ? "Edit tax rule" : "Add tax rule"}</SheetTitle>
            <SheetDescription>Changing a rate affects the next invoice on every subscription using it.</SheetDescription>
          </SheetHeader>
          <form
            className="mt-4 grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <ResultBanner error={request.error} />
            <FormField label="Name" htmlFor="tax-name" required error={request.fields.name?.[0]}>
              <Input id="tax-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </FormField>
            <FormField label="Rate (%)" htmlFor="tax-rate" required error={request.fields.rateBps?.[0]} hint="Up to two decimal places, for example 18 or 2.5">
              <Input id="tax-rate" inputMode="decimal" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })} />
            </FormField>
            <CheckboxField
              id="tax-active"
              label="Offer on products"
              hint="Turning this off hides it from new products. Subscriptions already using it keep it."
              checked={form.active}
              onChange={(active) => setForm({ ...form, active })}
            />
            <div className="flex gap-2">
              <Button type="submit" variant="stamp" disabled={request.busy}>{request.busy ? "Saving..." : "Save tax rule"}</Button>
              <Button type="button" variant="outline-paper" onClick={() => setFormOpen(false)}>Cancel</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <ConfirmDelete
        title={deleting ? `Delete ${deleting.name}?` : null}
        description="A tax already on a subscription can't be deleted. It will also be removed from any products using it."
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
