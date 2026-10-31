"use client";

import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { SignOutButton } from "./sign-out-button";

/** A simple top bar for staff pages, so they can move around and sign out. */
export function AccountBar() {
  const { data } = authClient.useSession();
  const role = (data?.user as { role?: string } | undefined)?.role;

  return (
    <nav aria-label="Account" className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
      <div className="flex gap-4 text-sm font-semibold text-blue-600">
        <Link href="/subscriptions" className="hover:underline">Subscriptions</Link>
        {role === "admin" && <Link href="/admin/staff" className="hover:underline">Add staff</Link>}
      </div>
      <SignOutButton />
    </nav>
  );
}
