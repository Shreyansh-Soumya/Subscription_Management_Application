import { PageHeader } from "@/components/app/page-header";
import { db } from "@/db";
import { countDueSubscriptions } from "@/lib/billing";
import { appToday } from "@/lib/clock";
import { formatDate } from "@/lib/format";
import { countDraftInvoices } from "@/lib/invoices";
import { requirePageRole } from "@/lib/permissions";
import { BillingPanel } from "./billing-panel";

export const instant = false;

export default async function BillingPage() {
  await requirePageRole(["admin", "staff"]);
  const today = await appToday(db);
  const [due, drafts] = await Promise.all([countDueSubscriptions(db, today), countDraftInvoices(db)]);

  return (
    <>
      <PageHeader
        title="Billing run"
        description={`Create invoices for everything due by ${formatDate(today)}. It's safe to run again: nothing gets billed twice.`}
      />
      <BillingPanel due={due} drafts={drafts} />
    </>
  );
}
