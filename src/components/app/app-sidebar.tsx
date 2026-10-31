"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { navigationForRole, type NavGroup, type Role } from "@/lib/navigation";
import type { AppShellUser } from "./app-shell";

type AppSidebarProps = {
  role?: Role;
  user?: AppShellUser | null;
};

function isActivePath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function WorkspaceLogo() {
  return (
    <Link
      href="/dashboard"
      aria-label="Brightloop home"
      className="inline-flex items-stretch border-[1.5px] border-ink"
    >
      <span className="headline flex items-center bg-ink px-2 py-1 text-[18px] leading-none text-sheet group-data-[collapsible=icon]:hidden">
        Bright
      </span>
      <span className="headline flex items-center px-2 py-1 text-[18px] leading-none group-data-[collapsible=icon]:hidden">
        loop
      </span>
      <span className="headline hidden items-center bg-ink px-2 py-1 text-[18px] leading-none text-sheet group-data-[collapsible=icon]:flex">
        B
      </span>
    </Link>
  );
}

function NavGroups({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname() ?? "/";

  return (
    <>
      {groups.map((group) => (
        <SidebarGroup key={group.label}>
          <SidebarGroupLabel className="font-mono text-[11px] uppercase tracking-[0.1em] text-ink-soft">
            {group.label}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    asChild
                    isActive={isActivePath(pathname, item.href)}
                    tooltip={item.title}
                  >
                    <Link href={item.href}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

function SignedOutNav() {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <p className="px-2 py-4 font-mono text-[11px] uppercase tracking-[0.1em] leading-relaxed text-ink-soft">
          Sign in to see your workspace.
        </p>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function UserFooter({ user }: { user: AppShellUser }) {
  const initials = user.name
    .split(/\s+/)
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <div className="flex items-center gap-2 border border-rule-strong bg-sheet p-2">
      <Avatar className="size-8">
        {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
        <AvatarFallback className="bg-ink text-[11px] font-semibold text-sheet">
          {initials || "?"}
        </AvatarFallback>
      </Avatar>
      <div className="grid min-w-0 flex-1 text-left leading-tight group-data-[collapsible=icon]:hidden">
        <span className="truncate text-[13px] font-semibold">{user.name}</span>
        <span className="num truncate font-mono text-[10px] text-ink-soft">
          {user.email}
        </span>
      </div>
    </div>
  );
}

export function AppSidebar({ role, user }: AppSidebarProps) {
  const groups = role ? navigationForRole(role) : [];

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center px-2 py-1.5">
          <WorkspaceLogo />
        </div>
      </SidebarHeader>
      <SidebarContent>
        {groups.length > 0 ? <NavGroups groups={groups} /> : <SignedOutNav />}
      </SidebarContent>
      <SidebarFooter>
        {user ? (
          <UserFooter user={user} />
        ) : (
          <p className="px-2 py-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink-soft">
            Not signed in
          </p>
        )}
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
