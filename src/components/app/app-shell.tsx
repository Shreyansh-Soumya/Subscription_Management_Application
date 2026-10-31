"use client";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { Role } from "@/lib/navigation";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { PageContainer } from "./page-container";

/**
 * Display-only identity props. Task 01 implements no authentication: feature
 * owners (or the future auth owner) pass presentation values from their own
 * layout. The shell renders fully without an authenticated user.
 */
export type AppShellUser = {
  name: string;
  email: string;
  image?: string | null;
};

export type AppShellProps = {
  /** Presentation only: selects the navigation configuration. */
  role?: Role;
  /** Presentation only: shown in the sidebar footer and header avatar. */
  user?: AppShellUser | null;
  children: React.ReactNode;
};

export function AppShell({ role, user, children }: AppShellProps) {
  return (
    <SidebarProvider>
      <AppSidebar role={role} user={user} />
      <SidebarInset>
        <AppHeader user={user} />
        <main className="flex flex-1 flex-col">
          <PageContainer>{children}</PageContainer>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
