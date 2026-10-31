"use client";

import { Percent } from "lucide-react";
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
import { discountSchema, fieldErrorsOf } from "@/lib/catalog-validation";
import { formatDate } from "@/lib/format";
import { formatMoney } from "@/lib/money";
import { rupeesToPaise } from "@/lib/rupees";

type Discount = {
  id: string;
  name: string;
  kind: "percent" | "fixed";
  value: number;
  scope: "product" | "subscription";
  productIds: string[];
  minPurchasePaise: number;
  minQuantity: number;
  startsOn: string;
  endsOn: string;
  usageLimit: number | null;
  usageCount: number;
};

const EMPTY_FORM = {
  name: "",
  kind: "percent" as Discount["kind"],
  value: "",
  scope: "product" as Discount["scope"],
  productIds: [] as string[],
  minPurchase: "0",
  minQuantity: "0",
  startsOn: "",
  endsOn: "",
  usageLimit: "",
};

const amount = (row: Discount) => (row.kind === "percent" ? `${row.value / 100}%` : formatMoney(row.value));
const optionalWhole = (value: string) => (value.trim() === "" ? undefined : Number(value));

export function DiscountsManager({
  rows,
  total,
  page,
  pageSize,
  products,
}: {
  rows: Discount[];
  total: number;
  page: number;
  pageSize: number;
  products: { id: string; name: string }[];
}) {
  const request = useCatalogRequest();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleting, setDeleting] = useState<Discount | null>(null);

  const open = (discount: Discount | null) => {
    request.reset();
    setEditingId(discount?.id ?? null);
    setForm(
      discount
        ? {
            name: discount.name,
            kind: discount.kind,
            value: (discount.value / 100).toFixed(2),
            scope: discount.scope,
            productIds: discount.productIds,
            minPurchase: (discount.minPurchasePaise / 100).toFixed(2),
            minQuantity: String(discount.minQuantity),
            startsOn: discount.startsOn,
            endsOn: discount.endsOn,
            usageLimit: discount.usageLimit === null ? "" : String(discount.usageLimit),
          }
        : EMPTY_FORM,
    );
    setFormOpen(true);
  };

  const save = async () => {
    const parsed = discountSchema.safeParse({
      name: form.name,
      kind: form.kind,
      // Basis points and paise are both hundredths, so the same exact conversion covers percent and fixed.
      value: rupeesToPaise(form.value) ?? undefined,
      scope: form.scope,
      productIds: form.scope === "product" ? form.productIds : [],
      minPurchasePaise: rupeesToPaise(form.minPurchase) ?? undefined,
      minQuantity: optionalWhole(form.minQuantity),
      startsOn: form.startsOn,
      endsOn: form.endsOn,
      usageLimit: form.usageLimit.trim() === "" ? null : Number(form.usageLimit),
    });
    if (!parsed.success) return request.showProblems(fieldErrorsOf(parsed.error));

    const saved = await request.send(
      editingId ? `/api/discounts/${editingId}` : "/api/discounts",
      editingId ? "PUT" : "POST",
      parsed.data,
      editingId ? "Discount updated." : "Discount added.",
    );
    if (saved) setFormOpen(false);
  };

  const remove = async () => {
    if (!deleting) return;
    const { id } = deleting;
    setDeleting(null);
    await request.send(`/api/discounts/${id}`, "DELETE", undefined, "Discount deleted.");
  };

  const toggleProduct = (id: string, on: boolean) =>
    setForm((current) => ({
      ...current,
      productIds: on ? [...current.productIds, id] : current.productIds.filter((productId) => productId !== id),
    }));

  const columns: TableColumn<Discount>[] = [
    { key: "name", header: "Discount", cell: (row) => <span className="font-medium">{row.name}</span> },
    { key: "amount", header: "Amount", align: "right", cell: (row) => <span className="num font-mono">{amount(row)}</span> },
    {
      key: "scope",
      header: "Applies to",
      cell: (row) =>
        row.scope === "subscription"
          ? "Whole subscription"
          : products.filter((product) => row.productIds.includes(product.id)).map((product) => product.name).join(", ") || "No products",
    },
    {
      key: "minimum",
      header: "Minimum",
      cell: (row) =>
        [row.minPurchasePaise > 0 && formatMoney(row.minPurchasePaise), row.minQuantity > 0 && `${row.minQuantity} qty`].filter(Boolean).join(", ") || "None",
    },
    { key: "dates", header: "Valid", cell: (row) => `${formatDate(row.startsOn)} to ${formatDate(row.endsOn)}` },
    {
      key: "usage",
      header: "Used",
      align: "right",
      cell: (row) => <span className="num font-mono">{row.usageCount}{row.usageLimit === null ? "" : ` of ${row.usageLimit}`}</span>,
    },
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
        <Button variant="stamp" onClick={() => open(null)}>Add discount</Button>
      </div>
      {!formOpen ? <ResultBanner error={request.error} notice={request.notice} /> : null}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        emptyState={<EmptyState icon={Percent} title="No discounts yet" description="Add a rule such as 10% off 10 or more seats." />}
      />
      <PageLinks path="/discounts" page={page} total={total} pageSize={pageSize} />

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="w-full overflow-y-auto p-5 sm:max-w-lg">
          <SheetHeader className="p-0">
            <SheetTitle>{editingId ? "Edit discount" : "Add discount"}</SheetTitle>
            <SheetDescription>Comes off before tax, and appears on the next invoice automatically.</SheetDescription>
          </SheetHeader>
          <form
            className="mt-4 grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <ResultBanner error={request.error} />
            <FormField label="Name" htmlFor="discount-name" required error={request.fields.name?.[0]}>
              <Input id="discount-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Type" htmlFor="discount-kind" required error={request.fields.kind?.[0]}>
                <Select value={form.kind} onValueChange={(kind) => setForm({ ...form, kind: kind as Discount["kind"] })}>
                  <SelectTrigger id="discount-kind" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentage</SelectItem>
                    <SelectItem value="fixed">Fixed amount</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label={form.kind === "percent" ? "Percent off" : "Amount off (₹)"} htmlFor="discount-value" required error={request.fields.value?.[0]}>
                <Input id="discount-value" inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </FormField>
            </div>
            <FormField label="Applies to" htmlFor="discount-scope" required error={request.fields.scope?.[0]}>
              <Select value={form.scope} onValueChange={(scope) => setForm({ ...form, scope: scope as Discount["scope"] })}>
                <SelectTrigger id="discount-scope" className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="product">Specific products</SelectItem>
                  <SelectItem value="subscription">Whole subscriptions</SelectItem>
                </SelectContent>
              </Select>
            </FormField>
            {form.scope === "product" ? (
              <FormField label="Products" required error={request.fields.productIds?.[0]}>
                <div className="grid max-h-40 gap-2 overflow-y-auto">
                  {products.map((product) => (
                    <CheckboxField
                      key={product.id}
                      id={`discount-product-${product.id}`}
                      label={product.name}
                      checked={form.productIds.includes(product.id)}
                      onChange={(on) => toggleProduct(product.id, on)}
                    />
                  ))}
                </div>
              </FormField>
            ) : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Minimum purchase (₹)" htmlFor="discount-min-purchase" error={request.fields.minPurchasePaise?.[0]}>
                <Input id="discount-min-purchase" inputMode="decimal" value={form.minPurchase} onChange={(e) => setForm({ ...form, minPurchase: e.target.value })} />
              </FormField>
              <FormField label="Minimum quantity" htmlFor="discount-min-quantity" error={request.fields.minQuantity?.[0]}>
                <Input id="discount-min-quantity" inputMode="numeric" value={form.minQuantity} onChange={(e) => setForm({ ...form, minQuantity: e.target.value })} />
              </FormField>
              <FormField label="Starts" htmlFor="discount-starts" required error={request.fields.startsOn?.[0]}>
                <Input id="discount-starts" type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} />
              </FormField>
              <FormField label="Ends" htmlFor="discount-ends" required error={request.fields.endsOn?.[0]}>
                <Input id="discount-ends" type="date" value={form.endsOn} onChange={(e) => setForm({ ...form, endsOn: e.target.value })} />
              </FormField>
            </div>
            <FormField label="Usage limit" htmlFor="discount-limit" error={request.fields.usageLimit?.[0]} hint="Leave blank for no limit">
              <Input id="discount-limit" inputMode="numeric" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} />
            </FormField>
            <div className="flex gap-2">
              <Button type="submit" variant="stamp" disabled={request.busy}>{request.busy ? "Saving..." : "Save discount"}</Button>
              <Button type="button" variant="outline-paper" onClick={() => setFormOpen(false)}>Cancel</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <ConfirmDelete
        title={deleting ? `Delete ${deleting.name}?` : null}
        description="A discount already in use can't be deleted. Set its end date to stop it instead."
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
