
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { type AppRole, homeForRole } from "@/lib/roles";

export type { AppRole };

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

/** For pages. Sends logged-out visitors to login, and anyone without access to their own home. */
export async function requirePageRole(allowedRoles: AppRole[]) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!allowedRoles.includes(user.role as AppRole)) redirect(homeForRole(user.role));
  return user;
}

/**
 * For API routes. Returns the user, or a response to send back:
 *   const access = await authorizeRoute(["admin"]);
 *   if ("response" in access) return access.response;
 */
export async function authorizeRoute(allowedRoles: AppRole[]) {
  const user = await getCurrentUser();
  if (!user) return { response: Response.json({ error: "Log in to continue." }, { status: 401 }) };
  if (!allowedRoles.includes(user.role as AppRole)) {
    return { response: Response.json({ error: "You don't have access to this." }, { status: 403 }) };
  }
  return { user };
}
