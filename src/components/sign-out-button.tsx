"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  const [failed, setFailed] = useState(false);

  const signOut = async () => {
    setFailed(false);
    const { error } = await authClient.signOut().catch(() => ({ error: true }));
    if (error) {
      setFailed(true);
      return;
    }
    router.replace("/login");
    router.refresh();
  };

  return (
    <span className="inline-flex items-center gap-3">
      {failed && <span role="alert" className="text-sm text-red-600">You&apos;re still signed in. Try again.</span>}
      <button
        type="button"
        onClick={signOut}
        className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
      >
        Sign out
      </button>
    </span>
  );
}
