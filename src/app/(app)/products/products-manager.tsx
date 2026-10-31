"use client";

import { Package } from "lucide-react";
import { useEffect, useState } from "react";
import { CheckboxField, ConfirmDelete, PageLinks, ResultBanner } from "@/components/app/catalog-kit";
import { DataTable, type TableColumn } from "@/components/app/data-table";
import { EmptyState } from "@/components/app/empty-state";
import { FormField } from "@/components/app/form-field";
import { useCatalogRequest } from "@/components/app/use-catalog-request";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  fieldErrorsOf,
  productSchema,
  variantSchema,
  variantUnitPricePaise,
} from "@/lib/catalog-validation";
import { computeInvoice, type DiscountRule } from "@/lib/compute-invoice";
import { formatMoney } from "@/lib/money";
import { rupeesToPaise } from "@/lib/rupees";

type Product = {
  id: string;
  name: string;
  type: string;
  salesPricePaise: number;
  costPricePaise: number;
  notes: string | null;
  isAddon: boolean;
  taxRuleIds: string[];
};
type Variant = { id: string; productId: string; attribute: string; value: string; extraPricePaise: number };
type TaxOption = { id: string; name: string; rateBps: number; active: boolean };

const EMPTY_FORM = { name: "", type: "", price: "", cost: "", notes: "", isAddon: false, taxRuleIds: [] as string[] };
const rupees = (paise: number) => (paise / 100).toFixed(2);

export function ProductsManager({
  rows,
  total,
  page,
  pageSize,
  taxes,
  discounts,
  today,
}: {
  rows: Product[];
  total: number;
  page: number;
  pageSize: number;
  taxes: TaxOption[];
  discounts: DiscountRule[];
  today: string;
}) {
  const request = useCatalogRequest();
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleting, setDeleting] = useState<Product | null>(null);
  const [variantsOf, setVariantsOf] = useState<Product | null>(null);

  const open = (product: Product | null) => {
    request.reset();
    setEditingId(product?.id ?? null);
    setForm(
      product
        ? {
            name: product.name,
            type: product.type,
            price: rupees(product.salesPricePaise),
            cost: rupees(product.costPricePaise),
            notes: product.notes ?? "",
            isAddon: product.isAddon,
            taxRuleIds: product.taxRuleIds,
          }
        : EMPTY_FORM,
    );
    setFormOpen(true);
  };

  const save = async () => {
    const parsed = productSchema.safeParse({
      name: form.name,
      type: form.type,
      salesPricePaise: rupeesToPaise(form.price) ?? undefined,
      costPricePaise: rupeesToPaise(form.cost) ?? undefined,
      notes: form.notes.trim() || undefined,
      isAddon: form.isAddon,
      taxRuleIds: form.taxRuleIds,
    });
    if (!parsed.success) return request.showProblems(fieldErrorsOf(parsed.error));

    const saved = await request.send(
      editingId ? `/api/products/${editingId}` : "/api/products",
      editingId ? "PUT" : "POST",
      parsed.data,
      editingId ? "Product updated." : "Product added.",
    );
    if (saved) setFormOpen(false);
  };

  const remove = async () => {
    if (!deleting) return;
    const { id } = deleting;
    setDeleting(null);
    await request.send(`/api/products/${id}`, "DELETE", undefined, "Product deleted.");
  };

  const toggleTax = (id: string, on: boolean) =>
    setForm((current) => ({
      ...current,
      taxRuleIds: on ? [...current.taxRuleIds, id] : current.taxRuleIds.filter((taxId) => taxId !== id),
    }));

  const columns: TableColumn<Product>[] = [
    {
      key: "name",
      header: "Product",
      cell: (row) => (
        <>
          <span className="font-medium">{row.name}</span>
          {row.isAddon ? <span className="ml-2 font-mono text-[11px] uppercase text-stamp">Add-on</span> : null}
        </>
      ),
    },
    { key: "type", header: "Type", cell: (row) => row.type },
    { key: "sales", header: "Sales price", align: "right", cell: (row) => <span className="num font-mono">{formatMoney(row.salesPricePaise)}</span> },
    { key: "cost", header: "Cost price", align: "right", cell: (row) => <span className="num font-mono">{formatMoney(row.costPricePaise)}</span> },
    {
      key: "taxes",
      header: "Taxes",
      cell: (row) => taxes.filter((tax) => row.taxRuleIds.includes(tax.id)).map((tax) => tax.name).join(", ") || "None",
    },
    {
      key: "actions",
      header: "Actions",
      cell: (row) => (
        <span className="flex gap-1">
          <Button size="sm" variant="outline-paper" onClick={() => setVariantsOf(row)}>Variants and price</Button>
          <Button size="sm" variant="outline-paper" onClick={() => open(row)}>Edit</Button>
          <Button size="sm" variant="outline-paper" onClick={() => setDeleting(row)}>Delete</Button>
        </span>
      ),
    },
  ];

  return (
    <div className="mt-6 grid gap-4">
      <div>
        <Button variant="stamp" onClick={() => open(null)}>Add product</Button>
      </div>
      {!formOpen ? <ResultBanner error={request.error} notice={request.notice} /> : null}

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        emptyState={<EmptyState icon={Package} title="No products yet" description="Add the first thing Brightloop sells." />}
      />
      <PageLinks path="/products" page={page} total={total} pageSize={pageSize} />

      <Sheet open={formOpen} onOpenChange={setFormOpen}>
        <SheetContent className="w-full overflow-y-auto p-5 sm:max-w-lg">
          <SheetHeader className="p-0">
            <SheetTitle>{editingId ? "Edit product" : "Add product"}</SheetTitle>
            <SheetDescription>Existing subscriptions keep the price they were sold at.</SheetDescription>
          </SheetHeader>
          <form
            className="mt-4 grid gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <ResultBanner error={request.error} />
            <FormField label="Name" htmlFor="product-name" required error={request.fields.name?.[0]}>
              <Input id="product-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </FormField>
            <FormField label="Type" htmlFor="product-type" required error={request.fields.type?.[0]} hint="For example Software or Service">
              <Input id="product-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Sales price (₹)" htmlFor="product-price" required error={request.fields.salesPricePaise?.[0]}>
                <Input id="product-price" inputMode="decimal" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
              </FormField>
              <FormField label="Cost price (₹)" htmlFor="product-cost" required error={request.fields.costPricePaise?.[0]}>
                <Input id="product-cost" inputMode="decimal" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
              </FormField>
            </div>
            <FormField label="Notes" htmlFor="product-notes" error={request.fields.notes?.[0]}>
              <Textarea id="product-notes" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </FormField>
            <CheckboxField
              id="product-addon"
              label="Add-on"
              hint="Customers can switch this on and off in the portal."
              checked={form.isAddon}
              onChange={(isAddon) => setForm({ ...form, isAddon })}
            />
            <FormField label="Taxes" error={request.fields.taxRuleIds?.[0]} hint={taxes.length ? undefined : "Add tax rules on the Taxes page first."}>
              <div className="grid gap-2">
                {taxes
                  .filter((tax) => tax.active || form.taxRuleIds.includes(tax.id))
                  .map((tax) => (
                    <CheckboxField
                      key={tax.id}
                      id={`product-tax-${tax.id}`}
                      label={`${tax.name} (${tax.rateBps / 100}%)`}
                      checked={form.taxRuleIds.includes(tax.id)}
                      onChange={(on) => toggleTax(tax.id, on)}
                    />
                  ))}
              </div>
            </FormField>
            <div className="flex gap-2">
              <Button type="submit" variant="stamp" disabled={request.busy}>{request.busy ? "Saving..." : "Save product"}</Button>
              <Button type="button" variant="outline-paper" onClick={() => setFormOpen(false)}>Cancel</Button>
            </div>
          </form>
        </SheetContent>
      </Sheet>

      <Sheet open={variantsOf !== null} onOpenChange={(isOpen) => !isOpen && setVariantsOf(null)}>
        <SheetContent className="w-full overflow-y-auto p-5 sm:max-w-xl">
          <SheetHeader className="p-0">
            <SheetTitle>{variantsOf?.name}: variants and price</SheetTitle>
            <SheetDescription>A variant adds its extra price to the product&apos;s sales price.</SheetDescription>
          </SheetHeader>
          {/* Keyed so each product starts clean: no leftover draft, and a late response from another product is ignored. */}
          {variantsOf ? <VariantsPanel key={variantsOf.id} product={variantsOf} taxes={taxes} discounts={discounts} today={today} /> : null}
        </SheetContent>
      </Sheet>

      <ConfirmDelete
        title={deleting ? `Delete ${deleting.name}?` : null}
        description="This also deletes its variants. A product already on a subscription or invoice can't be deleted."
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}

const EMPTY_VARIANT = { attribute: "", value: "", price: "" };

function VariantsPanel({
  product,
  taxes,
  discounts,
  today,
}: {
  product: Product;
  taxes: TaxOption[];
  discounts: DiscountRule[];
  today: string;
}) {
  const request = useCatalogRequest();
  const [variants, setVariants] = useState<Variant[]>([]);
  const [status, setStatus] = useState<"loading" | "failed" | "ready">("loading");
  const [draft, setDraft] = useState(EMPTY_VARIANT);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Variant | null>(null);

  useEffect(() => {
    let stale = false;
    fetch(`/api/products/${product.id}/variants`)
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const result: Variant[] = await response.json();
        if (stale) return;
        setVariants(result);
        setStatus("ready");
      })
      .catch(() => {
        if (!stale) setStatus("failed");
      });
    return () => {
      stale = true;
    };
  }, [product.id]);

  const clearDraft = () => {
    setDraft(EMPTY_VARIANT);
    setEditing(null);
  };

  const save = async () => {
    const parsed = variantSchema.safeParse({
      attribute: draft.attribute,
      value: draft.value,
      // A blank price is an error, never ₹0.
      extraPricePaise: rupeesToPaise(draft.price) ?? undefined,
    });
    if (!parsed.success) return request.showProblems(fieldErrorsOf(parsed.error));

    const saved = await request.send<Variant>(
      editing ? `/api/products/${product.id}/variants/${editing}` : `/api/products/${product.id}/variants`,
      editing ? "PUT" : "POST",
      parsed.data,
      editing ? "Variant updated." : "Variant added.",
    );
    if (!saved) return;
    setVariants((current) => (editing ? current.map((item) => (item.id === saved.id ? saved : item)) : [...current, saved]));
    clearDraft();
  };

  const remove = async () => {
    if (!deleting) return;
    const { id } = deleting;
    setDeleting(null);
    const done = await request.send(`/api/products/${product.id}/variants/${id}`, "DELETE", undefined, "Variant deleted.");
    if (!done) return;
    setVariants((current) => current.filter((item) => item.id !== id));
    if (editing === id) clearDraft();
  };

  return (
    <div className="mt-4 grid gap-5">
      <ResultBanner error={request.error} notice={request.notice} />

      {status === "loading" ? <p className="text-sm text-ink-soft">Loading variants...</p> : null}
      {status === "failed" ? <p role="alert" className="text-sm text-stamp-red">Variants couldn&apos;t be loaded. Close this and try again.</p> : null}
      {status === "ready" && variants.length === 0 ? <p className="text-sm text-ink-soft">No variants added yet.</p> : null}

      {variants.length > 0 ? (
        <ul className="grid gap-2">
          {variants.map((variant) => (
            <li key={variant.id} className="flex flex-wrap items-center justify-between gap-2 border border-rule p-3 text-sm">
              <span>
                <strong>{variant.attribute}:</strong> {variant.value}
                <span className="num ml-2 font-mono text-ink-soft">
                  +{formatMoney(variant.extraPricePaise)} = {formatMoney(variantUnitPricePaise(product.salesPricePaise, variant.extraPricePaise))}
                </span>
              </span>
              <span className="flex gap-1">
                <Button
                  size="sm"
                  variant="outline-paper"
                  onClick={() => {
                    request.reset();
                    setEditing(variant.id);
                    setDraft({ attribute: variant.attribute, value: variant.value, price: rupees(variant.extraPricePaise) });
                  }}
                >
                  Edit
                </Button>
                <Button size="sm" variant="outline-paper" onClick={() => setDeleting(variant)}>Delete</Button>
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {status === "ready" ? (
        <form
          className="grid gap-3 border-t border-rule pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <FormField label="Attribute" htmlFor="variant-attribute" required error={request.fields.attribute?.[0]} hint="For example Brand">
              <Input id="variant-attribute" value={draft.attribute} onChange={(e) => setDraft({ ...draft, attribute: e.target.value })} />
            </FormField>
            <FormField label="Value" htmlFor="variant-value" required error={request.fields.value?.[0]} hint="For example Odoo">
              <Input id="variant-value" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
            </FormField>
            <FormField label="Extra price (₹)" htmlFor="variant-price" required error={request.fields.extraPricePaise?.[0]} hint="For example 560">
              <Input id="variant-price" inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
            </FormField>
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="stamp" disabled={request.busy}>{editing ? "Save variant" : "Add variant"}</Button>
            {editing ? <Button type="button" variant="outline-paper" onClick={clearDraft}>Cancel edit</Button> : null}
          </div>
        </form>
      ) : null}

      <PricePreview product={product} variants={variants} taxes={taxes} discounts={discounts} today={today} />

      <ConfirmDelete
        title={deleting ? `Delete ${deleting.attribute}: ${deleting.value}?` : null}
        description="A variant already on a subscription or quotation template can't be deleted."
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}

const NO_VARIANT = "none";

/** A live invoice preview. All the maths comes from computeInvoice(), the same as billing. */
function PricePreview({
  product,
  variants,
  taxes,
  discounts,
  today,
}: {
  product: Product;
  variants: Variant[];
  taxes: TaxOption[];
  discounts: DiscountRule[];
  today: string;
}) {
  const [variantId, setVariantId] = useState(NO_VARIANT);
  const [quantityText, setQuantityText] = useState("1");
  const variant = variants.find((item) => item.id === variantId);
  const quantity = /^[1-9]\d{0,5}$/.test(quantityText) ? Number(quantityText) : null;
  const unitPricePaise = variantUnitPricePaise(product.salesPricePaise, variant?.extraPricePaise);

  const invoice =
    quantity === null
      ? null
      : computeInvoice({
          lines: [
            {
              productId: product.id,
              description: product.name,
              quantity,
              unitPricePaise,
              taxes: taxes.filter((tax) => product.taxRuleIds.includes(tax.id)),
            },
          ],
          discounts,
          on: today,
        });

  const row = (label: string, value: string, strong = false) => (
    <div className={`flex justify-between gap-4 ${strong ? "border-t-[1.5px] border-ink pt-2 font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd className="num font-mono">{value}</dd>
    </div>
  );

  return (
    <section aria-label="Invoice preview" className="grid gap-3 border-[1.5px] border-ink bg-sheet p-4">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft">Invoice preview</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Variant" htmlFor="preview-variant">
          <Select value={variantId} onValueChange={setVariantId}>
            <SelectTrigger id="preview-variant" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={NO_VARIANT}>No variant</SelectItem>
              {variants.map((item) => (
                <SelectItem key={item.id} value={item.id}>{item.attribute}: {item.value}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Quantity" htmlFor="preview-quantity" error={quantity === null ? "Enter a whole number from 1." : undefined}>
          <Input id="preview-quantity" inputMode="numeric" value={quantityText} onChange={(e) => setQuantityText(e.target.value)} />
        </FormField>
      </div>
      {invoice ? (
        <dl className="grid gap-1 text-sm">
          {row("Sales price", formatMoney(product.salesPricePaise))}
          {variant ? row(`${variant.attribute}: ${variant.value}`, `+${formatMoney(variant.extraPricePaise)}`) : null}
          {row("Unit price", formatMoney(unitPricePaise))}
          {row("Subtotal", formatMoney(invoice.subtotalPaise))}
          {invoice.appliedDiscounts.map((discount) => row(discount.name, `-${formatMoney(discount.amountPaise)}`))}
          {invoice.taxes.map((tax) => row(tax.name, formatMoney(tax.amountPaise)))}
          {row("Total", formatMoney(invoice.totalPaise), true)}
        </dl>
      ) : null}
    </section>
  );
}

