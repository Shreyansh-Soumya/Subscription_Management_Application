import { describe, expect, it } from "vitest";
import { NAVIGATION, navigationForRole, type Role } from "./navigation";

const ROLES: Role[] = ["admin", "staff", "customer"];

const MANDATED_TITLES: Record<Role, string[]> = {
  admin: [
    "Dashboard",
    "Products",
    "Plans",
    "Subscriptions",
    "Customers",
    "Invoices",
    "Payments",
    "Discounts",
    "Reports",
    "Settings",
  ],
  staff: ["Dashboard", "Customers", "Subscriptions", "Invoices", "Payments"],
  customer: [
    "Overview",
    "My Subscriptions",
    "My Invoices",
    "Account Settings",
  ],
};

function itemsFor(role: Role) {
  return NAVIGATION[role].flatMap((group) => group.items);
}

describe("navigation", () => {
  it("exposes a configuration for every role", () => {
    expect(Object.keys(NAVIGATION).sort()).toEqual([...ROLES].sort());
  });

  it("returns the exact configuration for a role", () => {
    for (const role of ROLES) {
      expect(navigationForRole(role)).toBe(NAVIGATION[role]);
    }
  });

  it("contains exactly the mandated items for each role", () => {
    for (const role of ROLES) {
      const titles = itemsFor(role).map((item) => item.title);
      expect(titles.sort()).toEqual([...MANDATED_TITLES[role]].sort());
    }
  });

  it("every item has a non-empty title, an absolute href and an icon", () => {
    for (const role of ROLES) {
      for (const item of itemsFor(role)) {
        expect(item.title.length).toBeGreaterThan(0);
        expect(item.href.startsWith("/")).toBe(true);
        expect(item.icon).toBeDefined();
      }
    }
  });

  it("has unique hrefs within each role", () => {
    for (const role of ROLES) {
      const hrefs = itemsFor(role).map((item) => item.href);
      expect(new Set(hrefs).size).toBe(hrefs.length);
    }
  });

  it("every nav group has a non-empty label and at least one item", () => {
    for (const role of ROLES) {
      for (const group of NAVIGATION[role]) {
        expect(group.label.length).toBeGreaterThan(0);
        expect(group.items.length).toBeGreaterThan(0);
      }
    }
  });
});
