import { PageHeader } from "@/components/app/page-header";
import { db } from "@/db";
import { listPlans } from "@/lib/catalog-service";
import { requirePageRole } from "@/lib/permissions";
import { pageFrom } from "@/lib/product-service";
import { PlansManager } from "./plans-manager";

export const instant = false;

export default async function PlansPage({ searchParams }: { searchParams: Promise<{ page?: string | string[] }> }) {
  await requirePageRole(["admin"]);
  const plans = await listPlans(db, { page: pageFrom((await searchParams).page) });

  return (
    <>
      <PageHeader title="Plans" description="What each plan costs, how often it bills and what customers can do with it." />
      <PlansManager {...plans} />
    </>
  );
}
