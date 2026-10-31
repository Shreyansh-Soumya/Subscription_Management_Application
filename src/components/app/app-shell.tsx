"use client";

import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import type { Role } from "@/lib/navigation";
import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";
import { PageContainer } from "./page-container";

/** Display-only identity. `src/app/(app)/layout.tsx` passes in the signed-in user. */
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
  /** Whether the sidebar starts expanded. The app layout reads this from its cookie. */
  defaultOpen?: boolean;
  children: React.ReactNode;
};

export function AppShell({ role, user, defaultOpen = true, children }: AppShellProps) {
  return (
    <SidebarProvider defaultOpen={defaultOpen}>
      <AppSidebar role={role} user={user} />
      <SidebarInset>
        <AppHeader user={user} />
        <div className="flex flex-1 flex-col">
          <PageContainer>{children}</PageContainer>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
