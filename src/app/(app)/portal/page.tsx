import { SignOutButton } from "@/components/sign-out-button";
import { requirePageRole } from "@/lib/permissions";

export const instant = false;

// A holding page so customers land somewhere after login. Debangshu's portal replaces this.
export default async function PortalPage() {
  const user = await requirePageRole(["customer"]);
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-16">
      <h1 className="text-3xl font-bold text-gray-900">Welcome, {user.name}</h1>
      <p className="mt-3 text-gray-600">Your subscriptions and invoices will appear here.</p>
      <div className="mt-8"><SignOutButton /></div>
    </main>
  );
}
