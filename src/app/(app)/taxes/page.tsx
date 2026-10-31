import { PageHeader } from "@/components/app/page-header";
import { db } from "@/db";
import { listTaxRules } from "@/lib/catalog-service";
import { requirePageRole } from "@/lib/permissions";
import { pageFrom } from "@/lib/product-service";
import { TaxesManager } from "./taxes-manager";

export const instant = false;

export default async function TaxesPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  await requirePageRole(["admin"]);
  const taxes = await listTaxRules(db, { page: pageFrom((await searchParams).page) });

  return (
    <>
      <PageHeader title="Taxes" description="The rates invoices use. Choose which ones apply to each product on the Products page." />
      <TaxesManager {...taxes} />
    </>
  );
}
