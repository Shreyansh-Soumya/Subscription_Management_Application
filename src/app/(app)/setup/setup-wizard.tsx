"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckboxField, ResultBanner } from "@/components/app/catalog-kit";
import { FormField } from "@/components/app/form-field";
import { useCatalogRequest } from "@/components/app/use-catalog-request";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  type FieldErrors,
  fieldErrorsOf,
  planSchema,
  productSchema,
  setupDiscountSchema,
  taxRuleSchema,
  variantSchema,
} from "@/lib/catalog-validation";
import { formatMoney } from "@/lib/money";
import { rupeesToPaise } from "@/lib/rupees";
import { previewSetup } from "@/lib/setup-preview";

type TaxOption = { id: string; name: string; rateBps: number };
type Frequency = "daily" | "weekly" | "monthly" | "yearly";
type DraftVariant = { key: number; attribute: string; value: string; extraPricePaise: number };

const STEPS = ["Product", "Variants", "Plan", "Rules"] as const;
const NO_VARIANT = "none";

const money = (text: string) => rupeesToPaise(text) ?? undefined;
const whole = (text: string) => (text.trim() === "" ? undefined : Number(text));
const wholeOr = (text: string, fallback: number) => (/^\d+$/.test(text.trim()) ? Number(text) : fallback);

export function SetupWizard({ taxes, today }: { taxes: TaxOption[]; today: string }) {
  const request = useCatalogRequest();
  const [step, setStep] = useState(0);
  const [launched, setLaunched] = useState<string | null>(null);

  const [product, setProduct] = useState({ name: "", type: "", price: "", cost: "", notes: "", isAddon: false });

  const [variants, setVariants] = useState<DraftVariant[]>([]);
  const [draft, setDraft] = useState({ attribute: "", value: "", price: "" });
  const [nextKey, setNextKey] = useState(1);

  const [plan, setPlan] = useState({
    name: "",
    price: "",
    frequency: "monthly" as Frequency,
    minQuantity: "1",
    availableFrom: "",
    availableTo: "",
    autoClose: false,
    canCloseEarly: true,
    canPause: true,
    canRenew: true,
  });

  const [taxRuleIds, setTaxRuleIds] = useState<string[]>([]);
  const [addTax, setAddTax] = useState(false);
  const [newTax, setNewTax] = useState({ name: "", rate: "" });

  const [addDiscount, setAddDiscount] = useState(false);
  const [discount, setDiscount] = useState({
    name: "",
    kind: "percent" as "percent" | "fixed",
    value: "",
    scope: "product" as "product" | "subscription",
    minPurchase: "0",
    minQuantity: "0",
    startsOn: today,
    endsOn: "",
    usageLimit: "",
  });

  const [previewKey, setPreviewKey] = useState<string>(NO_VARIANT);
  const [quantityText, setQuantityText] = useState("1");

  const parts = {
    product: () =>
      productSchema.omit({ taxRuleIds: true }).safeParse({
        name: product.name,
        type: product.type,
        salesPricePaise: money(product.price),
        costPricePaise: money(product.cost),
        notes: product.notes.trim() || undefined,
        isAddon: product.isAddon,
      }),
    plan: () =>
      planSchema.safeParse({
        name: plan.name,
        // A blank plan price starts from the product's own price, the same as the preview shows.
        pricePaise: plan.price.trim() === "" ? money(product.price) : money(plan.price),
        frequency: plan.frequency,
        minQuantity: whole(plan.minQuantity),
        availableFrom: plan.availableFrom || null,
        availableTo: plan.availableTo || null,
        autoClose: plan.autoClose,
        canCloseEarly: plan.canCloseEarly,
        canPause: plan.canPause,
        canRenew: plan.canRenew,
      }),
    newTax: () =>
      // Two decimal places of a percent are whole basis points, the same exact conversion as rupees to paise.
      taxRuleSchema.safeParse({ name: newTax.name, rateBps: money(newTax.rate), active: true }),
    discount: () =>
      setupDiscountSchema.safeParse({
        name: discount.name,
        kind: discount.kind,
        value: money(discount.value),
        scope: discount.scope,
        minPurchasePaise: money(discount.minPurchase),
        minQuantity: whole(discount.minQuantity),
        startsOn: discount.startsOn,
        endsOn: discount.endsOn,
        usageLimit: discount.usageLimit.trim() === "" ? null : Number(discount.usageLimit),
      }),
  };

  /** Moves on only when this step is valid, showing what's wrong beside each field. */
  const next = () => {
    const parsed = step === 0 ? parts.product() : step === 2 ? parts.plan() : null;
    if (parsed && !parsed.success) return request.showProblems(fieldErrorsOf(parsed.error));
    if (step === 1 && (draft.attribute.trim() || draft.value.trim() || draft.price.trim())) {
      return request.showProblems({ attribute: ["Add this variant or clear it before moving on."] });
    }
    request.reset();
    setStep(step + 1);
  };

  const addVariant = () => {
    const parsed = variantSchema.safeParse({ attribute: draft.attribute, value: draft.value, extraPricePaise: money(draft.price) });
    if (!parsed.success) return request.showProblems(fieldErrorsOf(parsed.error));
    const isDuplicate = variants.some(
      (item) =>
        item.attribute.toLowerCase() === parsed.data.attribute.toLowerCase() && item.value.toLowerCase() === parsed.data.value.toLowerCase(),
    );
    if (isDuplicate) return request.showProblems({ value: ["This variant is already listed."] });
    request.reset();
    setVariants([...variants, { key: nextKey, ...parsed.data }]);
    setNextKey(nextKey + 1);
    setPreviewKey(String(nextKey));
    setDraft({ attribute: "", value: "", price: "" });
  };

  const launch = async () => {
    const parsedProduct = parts.product();
    const parsedPlan = parts.plan();
    const parsedTax = addTax ? parts.newTax() : null;
    const parsedDiscount = addDiscount ? parts.discount() : null;
    if (!parsedProduct.success) {
      setStep(0);
      return request.showProblems(fieldErrorsOf(parsedProduct.error));
    }
    if (!parsedPlan.success) {
      setStep(2);
      return request.showProblems(fieldErrorsOf(parsedPlan.error));
    }
    const problems: FieldErrors = {};
    if (parsedTax && !parsedTax.success) Object.assign(problems, prefixed("tax", fieldErrorsOf(parsedTax.error)));
    if (parsedDiscount && !parsedDiscount.success) Object.assign(problems, prefixed("discount", fieldErrorsOf(parsedDiscount.error)));
    if (Object.keys(problems).length > 0) return request.showProblems(problems);

    const result = await request.send(
      "/api/setup",
      "POST",
      {
        product: parsedProduct.data,
        variants: variants.map(({ attribute, value, extraPricePaise }) => ({ attribute, value, extraPricePaise })),
        plan: parsedPlan.data,
        taxRuleIds,
        newTax: parsedTax?.success ? parsedTax.data : null,
        discount: parsedDiscount?.success ? parsedDiscount.data : null,
      },
      "Launched.",
    );
    if (result) setLaunched(product.name.trim());
  };

  // The preview follows the form as it's typed, so half-typed numbers count as nothing rather than breaking it.
  const chosen = variants.find((item) => String(item.key) === previewKey);
  const quantity = /^[1-9]\d{0,5}$/.test(quantityText) ? Number(quantityText) : null;
  const minQuantity = wholeOr(plan.minQuantity, 1);
  const salesPricePaise = rupeesToPaise(product.price) ?? 0;
  const planPricePaise = plan.price.trim() === "" ? null : (rupeesToPaise(plan.price) ?? 0);
  const previewTaxes = [
    ...taxes.filter((tax) => taxRuleIds.includes(tax.id)),
    ...(addTax && rupeesToPaise(newTax.rate) !== null
      ? [{ id: "new-tax", name: newTax.name.trim() || "New tax", rateBps: rupeesToPaise(newTax.rate) ?? 0 }]
      : []),
  ];
  const discountValue = rupeesToPaise(discount.value);
  const previewDiscount =
    addDiscount && discountValue !== null && discount.startsOn && discount.endsOn
      ? {
          name: discount.name.trim() || "New discount",
          kind: discount.kind,
          value: discountValue,
          scope: discount.scope,
          minPurchasePaise: rupeesToPaise(discount.minPurchase) ?? 0,
          minQuantity: wholeOr(discount.minQuantity, 0),
          startsOn: discount.startsOn,
          endsOn: discount.endsOn,
          usageLimit: discount.usageLimit.trim() === "" ? null : wholeOr(discount.usageLimit, 1),
        }
      : null;
  const preview =
    quantity === null
      ? null
      : previewSetup({
          productName: product.name || "New product",
          salesPricePaise,
          planPricePaise,
          extraPricePaise: chosen?.extraPricePaise ?? 0,
          quantity,
          taxes: previewTaxes,
          discount: previewDiscount,
          today,
        });

  if (launched) {
    return (
      <div className="mt-6 grid max-w-xl gap-4 border-[1.5px] border-ink bg-sheet p-5">
        <p role="status" className="text-lg font-semibold">{launched} is live.</p>
        <p className="text-sm text-ink-soft">The product, variants, plan and rules are saved. Quotes and subscriptions can use them now.</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="stamp"><Link href="/products">See products</Link></Button>
          <Button asChild variant="outline-paper"><Link href="/plans">See plans</Link></Button>
        </div>
      </div>
    );
  }

  const fields = request.fields;

  return (
    <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid min-w-0 gap-5">
        <ol className="flex flex-wrap gap-2" aria-label="Setup steps">
          {STEPS.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                disabled={index > step}
                aria-current={index === step ? "step" : undefined}
                onClick={() => {
                  request.reset();
                  setStep(index);
                }}
                className={`border-[1.5px] px-3 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] ${
                  index === step ? "border-ink bg-ink text-white" : "border-rule text-ink-soft disabled:opacity-60"
                }`}
              >
                {index + 1}. {label}
              </button>
            </li>
          ))}
        </ol>

        <ResultBanner error={request.error} />

        {step === 0 ? (
          <section aria-label="Product" className="grid gap-4">
            <FormField label="Name" htmlFor="setup-name" required error={fields.name?.[0]}>
              <Input id="setup-name" value={product.name} onChange={(e) => setProduct({ ...product, name: e.target.value })} />
            </FormField>
            <FormField label="Type" htmlFor="setup-type" required error={fields.type?.[0]} hint="For example Software or Service">
              <Input id="setup-type" value={product.type} onChange={(e) => setProduct({ ...product, type: e.target.value })} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Sales price (₹)" htmlFor="setup-price" required error={fields.salesPricePaise?.[0]}>
                <Input id="setup-price" inputMode="decimal" value={product.price} onChange={(e) => setProduct({ ...product, price: e.target.value })} />
              </FormField>
              <FormField label="Cost price (₹)" htmlFor="setup-cost" required error={fields.costPricePaise?.[0]}>
                <Input id="setup-cost" inputMode="decimal" value={product.cost} onChange={(e) => setProduct({ ...product, cost: e.target.value })} />
              </FormField>
            </div>
            <FormField label="Notes" htmlFor="setup-notes" error={fields.notes?.[0]}>
              <Textarea id="setup-notes" value={product.notes} onChange={(e) => setProduct({ ...product, notes: e.target.value })} />
            </FormField>
            <CheckboxField
              id="setup-addon"
              label="Add-on"
              hint="Customers can switch this on and off in the portal."
              checked={product.isAddon}
              onChange={(isAddon) => setProduct({ ...product, isAddon })}
            />
          </section>
        ) : null}

        {step === 1 ? (
          <section aria-label="Variants" className="grid gap-4">
            <p className="text-sm text-ink-soft">Optional. A variant adds its extra price, for example the Odoo brand adds ₹560.</p>
            {variants.length > 0 ? (
              <ul className="grid gap-2">
                {variants.map((item) => (
                  <li key={item.key} className="flex flex-wrap items-center justify-between gap-2 border border-rule p-3 text-sm">
                    <span>
                      <strong>{item.attribute}:</strong> {item.value}
                      <span className="num ml-2 font-mono text-ink-soft">+{formatMoney(item.extraPricePaise)}</span>
                    </span>
                    <Button size="sm" variant="outline-paper" onClick={() => setVariants(variants.filter((other) => other.key !== item.key))}>
                      Remove
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="grid gap-3 sm:grid-cols-3">
              <FormField label="Attribute" htmlFor="setup-attribute" error={fields.attribute?.[0]} hint="For example Brand">
                <Input id="setup-attribute" value={draft.attribute} onChange={(e) => setDraft({ ...draft, attribute: e.target.value })} />
              </FormField>
              <FormField label="Value" htmlFor="setup-value" error={fields.value?.[0]} hint="For example Odoo">
                <Input id="setup-value" value={draft.value} onChange={(e) => setDraft({ ...draft, value: e.target.value })} />
              </FormField>
              <FormField label="Extra price (₹)" htmlFor="setup-extra" error={fields.extraPricePaise?.[0]} hint="For example 560">
                <Input id="setup-extra" inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} />
              </FormField>
            </div>
            <div>
              <Button variant="outline-paper" onClick={addVariant}>Add variant</Button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section aria-label="Plan" className="grid gap-4">
            <FormField label="Plan name" htmlFor="setup-plan-name" required error={fields.name?.[0]}>
              <Input id="setup-plan-name" value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-3">
              <FormField label="Plan price (₹)" htmlFor="setup-plan-price" error={fields.pricePaise?.[0]} hint="Blank uses the sales price">
                <Input id="setup-plan-price" inputMode="decimal" value={plan.price} onChange={(e) => setPlan({ ...plan, price: e.target.value })} />
              </FormField>
              <FormField label="Bills" htmlFor="setup-plan-frequency" required error={fields.frequency?.[0]}>
                <Select value={plan.frequency} onValueChange={(frequency) => setPlan({ ...plan, frequency: frequency as Frequency })}>
                  <SelectTrigger id="setup-plan-frequency" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Min. quantity" htmlFor="setup-plan-min" required error={fields.minQuantity?.[0]}>
                <Input id="setup-plan-min" inputMode="numeric" value={plan.minQuantity} onChange={(e) => setPlan({ ...plan, minQuantity: e.target.value })} />
              </FormField>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Available from" htmlFor="setup-plan-from" error={fields.availableFrom?.[0]}>
                <Input id="setup-plan-from" type="date" value={plan.availableFrom} onChange={(e) => setPlan({ ...plan, availableFrom: e.target.value })} />
              </FormField>
              <FormField label="Available to" htmlFor="setup-plan-to" error={fields.availableTo?.[0]}>
                <Input id="setup-plan-to" type="date" value={plan.availableTo} onChange={(e) => setPlan({ ...plan, availableTo: e.target.value })} />
              </FormField>
            </div>
            <div className="grid gap-2">
              <CheckboxField id="setup-auto" label="Closes on its own when it ends" checked={plan.autoClose} onChange={(autoClose) => setPlan({ ...plan, autoClose })} />
              <CheckboxField id="setup-early" label="Can be closed early" checked={plan.canCloseEarly} onChange={(canCloseEarly) => setPlan({ ...plan, canCloseEarly })} />
              <CheckboxField id="setup-pause" label="Can be paused" checked={plan.canPause} onChange={(canPause) => setPlan({ ...plan, canPause })} />
              <CheckboxField id="setup-renew" label="Can be renewed" checked={plan.canRenew} onChange={(canRenew) => setPlan({ ...plan, canRenew })} />
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section aria-label="Rules" className="grid gap-5">
            <fieldset className="grid gap-2">
              <legend className="mb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft">Taxes</legend>
              {taxes.map((tax) => (
                <CheckboxField
                  key={tax.id}
                  id={`setup-tax-${tax.id}`}
                  label={`${tax.name} (${tax.rateBps / 100}%)`}
                  checked={taxRuleIds.includes(tax.id)}
                  onChange={(on) => setTaxRuleIds(on ? [...taxRuleIds, tax.id] : taxRuleIds.filter((id) => id !== tax.id))}
                />
              ))}
              <CheckboxField id="setup-add-tax" label="Add a new tax rule" checked={addTax} onChange={setAddTax} />
              {addTax ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <FormField label="Tax name" htmlFor="setup-tax-name" required error={fields["tax.name"]?.[0]}>
                    <Input id="setup-tax-name" value={newTax.name} onChange={(e) => setNewTax({ ...newTax, name: e.target.value })} />
                  </FormField>
                  <FormField label="Rate (%)" htmlFor="setup-tax-rate" required error={fields["tax.rateBps"]?.[0]}>
                    <Input id="setup-tax-rate" inputMode="decimal" value={newTax.rate} onChange={(e) => setNewTax({ ...newTax, rate: e.target.value })} />
                  </FormField>
                </div>
              ) : null}
            </fieldset>

            <fieldset className="grid gap-3">
              <legend className="mb-2 font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft">Discount</legend>
              <CheckboxField id="setup-add-discount" label="Add a discount rule" checked={addDiscount} onChange={setAddDiscount} />
              {addDiscount ? (
                <div className="grid gap-3">
                  <FormField label="Discount name" htmlFor="setup-discount-name" required error={fields["discount.name"]?.[0]}>
                    <Input id="setup-discount-name" value={discount.name} onChange={(e) => setDiscount({ ...discount, name: e.target.value })} />
                  </FormField>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label="Type" htmlFor="setup-discount-kind" required>
                      <Select value={discount.kind} onValueChange={(kind) => setDiscount({ ...discount, kind: kind as "percent" | "fixed" })}>
                        <SelectTrigger id="setup-discount-kind" className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="percent">Percentage</SelectItem>
                          <SelectItem value="fixed">Fixed amount</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormField>
                    <FormField label={discount.kind === "percent" ? "Percent off" : "Amount off (₹)"} htmlFor="setup-discount-value" required error={fields["discount.value"]?.[0]}>
                      <Input id="setup-discount-value" inputMode="decimal" value={discount.value} onChange={(e) => setDiscount({ ...discount, value: e.target.value })} />
                    </FormField>
                    <FormField label="Applies to" htmlFor="setup-discount-scope" required hint={discount.scope === "subscription" ? "Choose it on each subscription it should apply to." : undefined}>
                      <Select value={discount.scope} onValueChange={(scope) => setDiscount({ ...discount, scope: scope as "product" | "subscription" })}>
                        <SelectTrigger id="setup-discount-scope" className="w-full"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="product">This product</SelectItem>
                          <SelectItem value="subscription">Whole subscriptions</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormField>
                    <FormField label="Usage limit" htmlFor="setup-discount-limit" error={fields["discount.usageLimit"]?.[0]} hint="Blank means no limit">
                      <Input id="setup-discount-limit" inputMode="numeric" value={discount.usageLimit} onChange={(e) => setDiscount({ ...discount, usageLimit: e.target.value })} />
                    </FormField>
                    <FormField label="Minimum purchase (₹)" htmlFor="setup-discount-purchase" error={fields["discount.minPurchasePaise"]?.[0]}>
                      <Input id="setup-discount-purchase" inputMode="decimal" value={discount.minPurchase} onChange={(e) => setDiscount({ ...discount, minPurchase: e.target.value })} />
                    </FormField>
                    <FormField label="Minimum quantity" htmlFor="setup-discount-quantity" error={fields["discount.minQuantity"]?.[0]}>
                      <Input id="setup-discount-quantity" inputMode="numeric" value={discount.minQuantity} onChange={(e) => setDiscount({ ...discount, minQuantity: e.target.value })} />
                    </FormField>
                    <FormField label="Starts" htmlFor="setup-discount-starts" required error={fields["discount.startsOn"]?.[0]}>
                      <Input id="setup-discount-starts" type="date" value={discount.startsOn} onChange={(e) => setDiscount({ ...discount, startsOn: e.target.value })} />
                    </FormField>
                    <FormField label="Ends" htmlFor="setup-discount-ends" required error={fields["discount.endsOn"]?.[0]}>
                      <Input id="setup-discount-ends" type="date" value={discount.endsOn} onChange={(e) => setDiscount({ ...discount, endsOn: e.target.value })} />
                    </FormField>
                  </div>
                </div>
              ) : null}
            </fieldset>
          </section>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-rule pt-4">
          {step > 0 ? (
            <Button
              variant="outline-paper"
              onClick={() => {
                request.reset();
                setStep(step - 1);
              }}
            >
              Back
            </Button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <Button variant="stamp" onClick={next}>Next: {STEPS[step + 1]}</Button>
          ) : (
            <Button variant="stamp" disabled={request.busy} onClick={() => void launch()}>
              {request.busy ? "Launching..." : "Launch product"}
            </Button>
          )}
        </div>
      </div>

      <aside aria-label="Invoice preview" className="grid gap-3 border-[1.5px] border-ink bg-sheet p-4 lg:sticky lg:top-4">
        <h2 className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft">First invoice preview</h2>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Variant" htmlFor="preview-variant">
            <Select value={chosen ? previewKey : NO_VARIANT} onValueChange={setPreviewKey}>
              <SelectTrigger id="preview-variant" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_VARIANT}>No variant</SelectItem>
                {variants.map((item) => (
                  <SelectItem key={item.key} value={String(item.key)}>{item.attribute}: {item.value}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormField>
          <FormField label="Quantity" htmlFor="preview-quantity" error={quantity === null ? "Enter a whole number from 1." : undefined}>
            <Input id="preview-quantity" inputMode="numeric" value={quantityText} onChange={(e) => setQuantityText(e.target.value)} />
          </FormField>
        </div>
        {quantity !== null && quantity < minQuantity ? (
          <p className="text-[12px] text-stamp-red">This plan needs a quantity of at least {minQuantity}.</p>
        ) : null}
        {preview ? (
          <>
          <dl className="grid gap-1 text-sm">
            <PreviewRow label={planPricePaise === null ? "Sales price" : "Plan price"} value={formatMoney(planPricePaise ?? salesPricePaise)} />
            {chosen ? <PreviewRow label={`${chosen.attribute}: ${chosen.value}`} value={`+${formatMoney(chosen.extraPricePaise)}`} /> : null}
            <PreviewRow label="Unit price" value={formatMoney(preview.unitPricePaise)} />
            <PreviewRow label="Subtotal" value={formatMoney(preview.invoice.subtotalPaise)} />
            {preview.invoice.appliedDiscounts.map((item) => (
              <PreviewRow key={item.id} label={item.name} value={`-${formatMoney(item.amountPaise)}`} />
            ))}
            {preview.invoice.taxes.map((tax) => (
              <PreviewRow key={tax.id} label={tax.name} value={formatMoney(tax.amountPaise)} />
            ))}
            <PreviewRow label="Total" value={formatMoney(preview.invoice.totalPaise)} strong />
          </dl>
          {preview.invoice.skippedDiscounts.map((item) => (
            <p key={item.id} className="text-[12px] text-ink-soft">{item.name} doesn&apos;t apply: {item.reason.toLowerCase()}.</p>
          ))}
          <p className="text-[12px] capitalize text-ink-soft">{plan.frequency} billing</p>
          </>
        ) : null}
      </aside>
    </div>
  );
}

function PreviewRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`flex justify-between gap-4 ${strong ? "border-t-[1.5px] border-ink pt-2 font-semibold" : ""}`}>
      <dt>{label}</dt>
      <dd className="num font-mono">{value}</dd>
    </div>
  );
}

function prefixed(prefix: string, problems: FieldErrors): FieldErrors {
  return Object.fromEntries(Object.entries(problems).map(([key, value]) => [`${prefix}.${key}`, value]));
}
