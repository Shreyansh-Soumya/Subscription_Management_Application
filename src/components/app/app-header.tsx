"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Fragment } from "react";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { AppShellUser } from "./app-shell";

const RECORD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function humanize(segment: string) {
  if (RECORD_ID.test(segment)) return "Details";
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

type AppHeaderProps = {
  user?: AppShellUser | null;
};

export function AppHeader({ user }: AppHeaderProps) {
  const pathname = usePathname() ?? "/";
  const segments = pathname.split("/").filter(Boolean);
  const crumbs = segments.map((segment, index) => ({
    label: humanize(segment),
    href: `/${segments.slice(0, index + 1).join("/")}`,
    isLast: index === segments.length - 1,
  }));

  const initials = user
    ? user.name
        .split(/\s+/)
        .map((part) => part[0])
        .filter(Boolean)
        .slice(0, 2)
        .join("")
        .toUpperCase()
    : "";

  return (
    <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-2 border-b-[1.5px] border-ink bg-paper px-4">
      <SidebarTrigger />
      <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
      <Breadcrumb>
        <BreadcrumbList>
          {crumbs.length === 0 ? (
            <BreadcrumbItem>
              <BreadcrumbPage className="font-mono text-[12px] uppercase tracking-[0.08em]">
                Brightloop
              </BreadcrumbPage>
            </BreadcrumbItem>
          ) : (
            crumbs.map((crumb) =>
              crumb.isLast ? (
                <BreadcrumbItem key={crumb.href}>
                  <BreadcrumbPage className="font-mono text-[12px] uppercase tracking-[0.08em]">
                    {crumb.label}
                  </BreadcrumbPage>
                </BreadcrumbItem>
              ) : (
                <Fragment key={crumb.href}>
                  <BreadcrumbItem className="hidden sm:block">
                    <BreadcrumbLink asChild>
                      <Link href={crumb.href}>{crumb.label}</Link>
                    </BreadcrumbLink>
                  </BreadcrumbItem>
                  <BreadcrumbSeparator className="hidden sm:block" />
                </Fragment>
              ),
            )
          )}
        </BreadcrumbList>
      </Breadcrumb>
      {user ? (
        <div className="ml-auto">
          <Avatar className="size-8 border-[1.5px] border-ink">
            {user.image ? <AvatarImage src={user.image} alt={user.name} /> : null}
            <AvatarFallback className="bg-ink text-[11px] font-semibold text-sheet">
              {initials || "?"}
            </AvatarFallback>
          </Avatar>
        </div>
      ) : null}
    </header>
  );
}
