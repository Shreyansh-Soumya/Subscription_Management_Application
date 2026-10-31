import { PageHeader } from "@/components/app/page-header";
import { db } from "@/db";
import { openInvoicesForMatching, pendingBankSuggestions } from "@/lib/bank-statements";
import { requirePageRole } from "@/lib/permissions";
import { BankMatcher } from "./bank-matcher";

export const instant = false;

export default async function BankMatchingPage() {
  await requirePageRole(["admin", "staff"]);
  const [lines, invoices] = await Promise.all([pendingBankSuggestions(db), openInvoicesForMatching(db)]);

  return (
    <>
      <PageHeader
        title="Bank matching"
        description="Upload a bank statement in CSV format. Each credit comes with a suggested invoice and the reason for it, and nothing is recorded until you confirm."
      />
      <BankMatcher lines={lines} invoices={invoices} />
    </>
  );
}
