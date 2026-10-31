import { PageHeader } from "@/components/app/page-header";
import { db } from "@/db";
import { taxRuleOptions } from "@/lib/catalog-service";
import { appToday } from "@/lib/clock";
import { requirePageRole } from "@/lib/permissions";
import { SetupWizard } from "./setup-wizard";

export const instant = false;

export default async function SetupPage() {
  await requirePageRole(["admin"]);
  const [taxes, today] = await Promise.all([taxRuleOptions(db), appToday(db)]);

  return (
    <>
      <PageHeader
        title="Guided setup"
        description="Launch a product step by step and watch its first invoice update as you go. Nothing saves until the last step."
      />
      <SetupWizard taxes={taxes.filter((tax) => tax.active)} today={today} />
    </>
  );
}
