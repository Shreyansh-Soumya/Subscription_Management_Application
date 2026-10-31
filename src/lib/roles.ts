export type AppRole = "admin" | "staff" | "customer";

/** Where each role lands after logging in. */
export function homeForRole(role: string | null | undefined): string {
  return role === "admin" || role === "staff" ? "/today" : "/portal";
}
