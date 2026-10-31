import { requirePageRole } from "@/lib/permissions";
import Dashboard from "./dashboard";

export const instant = false;

export default async function DashboardPage() {
  await requirePageRole(["admin", "staff"]);
  return <Dashboard />;
}
