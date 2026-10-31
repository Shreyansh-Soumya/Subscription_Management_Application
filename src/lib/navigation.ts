import type { LucideIcon } from "lucide-react";
import {
  CalendarClock,
  ChartColumn,
  CreditCard,
  FileText,
  Home,
  Landmark,
  Layers,
  ListChecks,
  LayoutDashboard,
  Package,
  Percent,
  Play,
  Receipt,
  ReceiptText,
  Repeat,
  Settings,
  UserPlus,
  Users,
  Wallet,
  Wand2,
} from "lucide-react";

/**
 * Presentation-only navigation configuration.
 *
 * This is NOT an authorization mechanism: hidden items are not security
 * controls. Roles are verified server-side by feature owners (see README
 * conventions). No authentication or role resolution lives here.
 */
export type Role = "admin" | "staff" | "customer";

export type NavItem = {
  title: string;
  href: string;
  icon: LucideIcon;
};

export type NavGroup = {
  label: string;
  items: NavItem[];
};

export const NAVIGATION: Record<Role, NavGroup[]> = {
  admin: [
    {
      label: "Overview",
      items: [{ title: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
    },
    {
      label: "Catalogue",
      items: [
        { title: "Guided setup", href: "/setup", icon: Wand2 },
        { title: "Products", href: "/products", icon: Package },
        { title: "Plans", href: "/plans", icon: Layers },
        { title: "Taxes", href: "/taxes", icon: Receipt },
      ],
    },
    {
      label: "Operations",
      items: [
        { title: "Today", href: "/today", icon: ListChecks },
        { title: "Subscriptions", href: "/subscriptions", icon: Repeat },
        { title: "Quote templates", href: "/quote-templates", icon: FileText },
        { title: "Customers", href: "/customers", icon: Users },
        { title: "Invoices", href: "/invoices", icon: ReceiptText },
        { title: "Payments", href: "/payments", icon: CreditCard },
        { title: "Billing run", href: "/billing", icon: Play },
        { title: "Bank matching", href: "/bank-matching", icon: Landmark },
        { title: "Discounts", href: "/discounts", icon: Percent },
      ],
    },
    {
      label: "Insights",
      items: [
        { title: "Finance", href: "/finance", icon: Wallet },
        { title: "Reports", href: "/reports", icon: ChartColumn },
      ],
    },
    {
      label: "Workspace",
      items: [
        { title: "Time machine", href: "/admin/time-machine", icon: CalendarClock },
        { title: "Add staff", href: "/admin/staff", icon: UserPlus },
        { title: "Settings", href: "/settings", icon: Settings },
      ],
    },
  ],
  staff: [
    {
      label: "Overview",
      items: [{ title: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
    },
    {
      label: "Operations",
      items: [
        { title: "Customers", href: "/customers", icon: Users },
        { title: "Today", href: "/today", icon: ListChecks },
        { title: "Subscriptions", href: "/subscriptions", icon: Repeat },
        { title: "Quote templates", href: "/quote-templates", icon: FileText },
        { title: "Invoices", href: "/invoices", icon: ReceiptText },
        { title: "Payments", href: "/payments", icon: CreditCard },
        { title: "Finance", href: "/finance", icon: Wallet },
        { title: "Billing run", href: "/billing", icon: Play },
        { title: "Bank matching", href: "/bank-matching", icon: Landmark },
      ],
    },
  ],
  customer: [
    {
      label: "Overview",
      items: [{ title: "Overview", href: "/portal", icon: Home }],
    },
    {
      label: "Billing",
      items: [
        { title: "My Subscriptions", href: "/my-subscriptions", icon: Repeat },
        { title: "My Invoices", href: "/my-invoices", icon: ReceiptText },
        { title: "Payments", href: "/my-payments", icon: CreditCard },
      ],
    },
    {
      label: "Account",
      items: [
        { title: "Account Settings", href: "/account-settings", icon: Settings },
      ],
    },
  ],
};

export function navigationForRole(role: Role): NavGroup[] {
  return NAVIGATION[role];
}
