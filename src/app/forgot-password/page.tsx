"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { error: requestError } = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
      if (requestError) {
        setError(requestError.message || "The reset email couldn't be sent. Try again.");
        return;
      }
      setSent(true);
    } catch {
      setError("The reset email couldn't be sent. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-md bg-sheet p-8 ">
        <h1 className="headline text-[34px] sm:text-[44px]">Reset your password</h1>
        {sent ? (
          <p role="status" className="mt-4 text-ink-soft">
            If {email} has an account, a reset link is on its way. It works for one hour.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8 space-y-5">
            <div>
              <label htmlFor="email" className="mb-2 block text-sm font-medium text-ink">Email address</label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="w-full border border-rule-strong px-4 py-3 outline-none focus:border-stamp"
              />
            </div>
            {error && <p role="alert" className="bg-sheet border border-stamp-red p-3 text-sm text-stamp-red">{error}</p>}
            <button type="submit" disabled={loading} className="w-full bg-ink py-3 font-semibold text-sheet hover:bg-ink-soft disabled:opacity-60">
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}
        <p className="mt-6 text-center text-sm">
          <Link href="/login" className="font-semibold text-stamp hover:underline">Back to sign in</Link>
        </p>
      </div>
    </main>
  );
}
