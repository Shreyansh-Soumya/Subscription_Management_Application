import { ComingSoon } from "@/components/app/coming-soon";
import { requirePageRole } from "@/lib/permissions";

export const instant = false;

export default async function CustomersPage() {
  await requirePageRole(["admin", "staff"]);
  return (
    <ComingSoon
      title="Customers"
      description="A dedicated customer directory is on the way. For now, search by customer name or email in Subscriptions."
      links={[{ href: "/subscriptions", label: "Search subscriptions" }, { href: "/invoices", label: "See invoices" }]}
    />
  );
}
