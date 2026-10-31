
import { redirect, notFound } from "next/navigation";
import { getServerSession } from "@/lib/auth-guard";

export const instant = false;
export default async function NewSubscriptionPage() {
  const session = await getServerSession();

  if (!session) {
    redirect("/login");
  }

  if (session.user.role !== "admin" && session.user.role !== "staff") {
    notFound();
  }

  return (
    <main className="min-h-screen p-8">
      <h1 className="text-2xl font-semibold">New Subscription</h1>
      <p className="mt-2 text-slate-600">
        Subscription creation form coming soon.
      </p>
    </main>
  );
}
