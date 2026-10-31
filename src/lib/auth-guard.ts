import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export type AppRole = "admin" | "staff" | "customer";

export async function getServerSession() {
  return auth.api.getSession({
    headers: await headers(),
    query: {
      disableCookieCache: true,
    },
  });
}

export async function requireSession() {
  const session = await getServerSession();

  if (!session) {
    throw new Error("UNAUTHENTICATED");
  }

  return session;
}

export async function requireRole(allowedRoles: readonly AppRole[]) {
  const session = await requireSession();
  const role = session.user.role;

  if (!allowedRoles.includes(role as AppRole)) {
    throw new Error("FORBIDDEN");
  }

  return session;
}
