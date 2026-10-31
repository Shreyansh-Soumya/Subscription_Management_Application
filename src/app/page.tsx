import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/permissions";
import { homeForRole } from "@/lib/roles";

export const instant = false;

export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? homeForRole(user.role) : "/login");
}
