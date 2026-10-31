
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export type AppRole = "admin" | "staff" | "customer";

export async function getCurrentUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user ?? null;
}

export async function requireRole(allowedRoles: AppRole[]) {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  if (!allowedRoles.includes(user.role as AppRole)) {
    throw new Error("FORBIDDEN");
  }

  return user;
}

export async function requireAdmin() {
  return requireRole(["admin"]);
}

export async function requireStaff() {
  return requireRole(["admin", "staff"]);
}

export async function requireCustomer() {
  return requireRole(["customer"]);
}
