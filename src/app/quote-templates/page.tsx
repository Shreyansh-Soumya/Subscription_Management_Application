import { desc, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { db } from "@/db";
import {
  plans,
  products,
  productVariants,
  quotationTemplates,
  quotationTemplateLines,
} from "@/db/schema";
import { getServerSession } from "@/lib/auth-guard";
import TemplateForm from "./template-form";

export const instant = false;

export default async function QuoteTemplatesPage() {
  const session = await getServerSession();

  if (!session) redirect("/login");
  if (session.user.role !== "admin" && session.user.role !== "staff") {
    redirect("/subscriptions");
  }

  const [planRows, productRows, variantRows, templates, lines] =
    await Promise.all([
      db.select({
        id: plans.id,
        name: plans.name,
        frequency: plans.frequency,
        pricePaise: plans.pricePaise,
      }).from(plans).orderBy(plans.name),

      db.select({
        id: products.id,
        name: products.name,
        salesPricePaise: products.salesPricePaise,
      }).from(products).orderBy(products.name),

      db.select({
        id: productVariants.id,
        productId: productVariants.productId,
        attribute: productVariants.attribute,
        value: productVariants.value,
      }).from(productVariants),

      db.select({
        id: quotationTemplates.id,
        name: quotationTemplates.name,
        validityDays: quotationTemplates.validityDays,
        notes: quotationTemplates.notes,
        createdAt: quotationTemplates.createdAt,
        planName: plans.name,
        frequency: plans.frequency,
      })
        .from(quotationTemplates)
        .innerJoin(plans, eq(quotationTemplates.planId, plans.id))
        .orderBy(desc(quotationTemplates.createdAt)),

      db.select({
        templateId: quotationTemplateLines.templateId,
        quantity: quotationTemplateLines.quantity,
        productName: products.name,
        variantAttribute: productVariants.attribute,
        variantValue: productVariants.value,
      })
        .from(quotationTemplateLines)
        .innerJoin(products, eq(quotationTemplateLines.productId, products.id))
        .leftJoin(
          productVariants,
          eq(quotationTemplateLines.variantId, productVariants.id),
        ),
    ]);

  return (
    <main className="mx-auto max-w-6xl space-y-8 p-6">
      <div>
        <a href="/subscriptions" className="text-sm text-gray-500 hover:underline">
          ← Back to subscriptions
        </a>
        <h1 className="mt-3 text-2xl font-bold">Quote templates</h1>
        <p className="mt-1 text-sm text-gray-500">
          Create and manage reusable quotation configurations.
        </p>
      </div>

      <TemplateForm
        plans={planRows}
        products={productRows}
        variants={variantRows}
      />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Saved templates</h2>
          <span className="text-sm text-gray-500">
            {templates.length} template{templates.length === 1 ? "" : "s"}
          </span>
        </div>

        {templates.length === 0 ? (
          <div className="rounded-xl border border-dashed p-10 text-center text-sm text-gray-500">
            No quote templates yet. Create your first template above.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {templates.map((template) => {
              const templateLines = lines.filter(
                (line) => line.templateId === template.id,
              );

              return (
                <article
                  key={template.id}
                  className="rounded-xl border bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-semibold">{template.name}</h3>
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs text-blue-700">
                      {template.validityDays} days validity
                    </span>
                  </div>

                  <p className="mt-2 text-sm text-gray-600">
                    Plan: {template.planName} ({template.frequency})
                  </p>

                  <div className="mt-4 border-t pt-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Products
                    </p>
                    <ul className="space-y-2 text-sm">
                      {templateLines.map((line, index) => (
                        <li key={index} className="flex justify-between gap-3">
                          <span>
                            {line.productName}
                            {line.variantAttribute && line.variantValue
                              ? ` · ${line.variantAttribute}: ${line.variantValue}`
                              : ""}
                          </span>
                          <span className="text-gray-500">
                            Qty: {line.quantity}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {template.notes && (
                    <p className="mt-3 text-sm text-gray-500">
                      {template.notes}
                    </p>
                  )}

                  <p className="mt-4 text-xs text-gray-400">
                    Created:{" "}
                    {new Date(template.createdAt).toLocaleDateString("en-IN")}
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
