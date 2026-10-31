import { ComingSoon } from "@/components/app/coming-soon";
import { requirePageRole } from "@/lib/permissions";

export const instant = false;

export default async function SettingsPage() {
  await requirePageRole(["admin"]);
  return (
    <ComingSoon
      title="Settings"
      description="Company settings are on the way. For now, add staff and manage tax rules from their own pages."
      links={[{ href: "/admin/staff", label: "Add staff" }, { href: "/taxes", label: "Manage taxes" }]}
    />
  );
}
