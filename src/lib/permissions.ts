
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { ensureCustomerRecord } from "@/lib/accounts";
import { auth } from "@/lib/auth";
import { type AppRole, homeForRole } from "@/lib/roles";

export type { AppRole };

export async function getCurrentUser() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  return session?.user ?? null;
}

/** For pages. Sends logged-out visitors to login, and anyone without access to their own home. */
export async function requirePageRole(allowedRoles: AppRole[]) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!allowedRoles.includes(user.role as AppRole)) redirect(homeForRole(user.role));
  if (user.role === "customer") await ensureCustomerRecord(db, user);
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
