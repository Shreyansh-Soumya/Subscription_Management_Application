import { ComingSoon } from "@/components/app/coming-soon";
import { requirePageRole } from "@/lib/permissions";

export const instant = false;

export default async function ReportsPage() {
  await requirePageRole(["admin"]);
  return (
    <ComingSoon
      title="Reports"
      description="Saved reports are on the way. For now, Invoices and Payments show what's paid, outstanding and overdue."
      links={[{ href: "/invoices", label: "See invoices" }, { href: "/payments", label: "See payments" }]}
    />
  );
}
