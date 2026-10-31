import { cookies } from "next/headers";
import { AppShell } from "@/components/app/app-shell";
import type { Role } from "@/lib/navigation";
import { requirePageRole } from "@/lib/permissions";

export const instant = false;

/**
 * The one shell for every signed-in page, so it never remounts between pages.
 * This only chooses the navigation: each page still calls requirePageRole, because
 * layouts don't re-run when moving between pages.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageRole(["admin", "staff", "customer"]);
  const sidebarState = (await cookies()).get("sidebar_state")?.value;

  return (
    <AppShell
      role={user.role as Role}
      user={{ name: user.name, email: user.email, image: user.image }}
      defaultOpen={sidebarState !== "false"}
    >
      {children}
    </AppShell>
  );
}
