import { AppShell } from "@/components/app/app-shell";

/**
 * Demonstration layout for the isolated /dashboard demo route. It shows the
 * "direct adoption" pattern: a feature owner renders <AppShell> in their own
 * layout. No authentication: no `user` prop → the shell renders signed-out.
 * `role="admin"` is a presentation-only value that selects a nav config.
 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppShell role="admin">{children}</AppShell>;
}
