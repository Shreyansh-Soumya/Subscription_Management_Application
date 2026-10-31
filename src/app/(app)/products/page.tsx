import { PageHeader } from "@/components/app/page-header";
import { db } from "@/db";
import { productDiscountRules, taxRuleOptions } from "@/lib/catalog-service";
import { appToday } from "@/lib/clock";
import { requirePageRole } from "@/lib/permissions";
import { listProducts, pageFrom } from "@/lib/product-service";
import { ProductsManager } from "./products-manager";

export const instant = false;

export default async function ProductsPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  await requirePageRole(["admin"]);
  const page = pageFrom((await searchParams).page);
  const [products, taxes, discounts, today] = await Promise.all([
    listProducts(db, { page }),
    taxRuleOptions(db),
    productDiscountRules(db),
    appToday(db),
  ]);

  return (
    <>
      <PageHeader title="Products" description="What Brightloop sells, with its prices, taxes and variants." />
      <ProductsManager {...products} taxes={taxes} discounts={discounts} today={today} />
    </>
  );
}
