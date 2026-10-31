import { PageHeader } from "@/components/app/page-header";
import { db } from "@/db";
import { listDiscounts, productOptions } from "@/lib/catalog-service";
import { requirePageRole } from "@/lib/permissions";
import { pageFrom } from "@/lib/product-service";
import { DiscountsManager } from "./discounts-manager";

export const instant = false;

export default async function DiscountsPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  await requirePageRole(["admin"]);
  const page = pageFrom((await searchParams).page);
  const [discounts, products] = await Promise.all([listDiscounts(db, { page }), productOptions(db)]);

  return (
    <>
      <PageHeader title="Discounts" description="Rules that come off the next invoice on their own, and stop when they expire or run out." />
      <DiscountsManager {...discounts} products={products} />
    </>
  );
}
