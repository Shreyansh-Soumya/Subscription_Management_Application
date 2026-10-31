"use client";

import { Suspense, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_RULES, passwordProblem } from "@/lib/password";

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <p role="alert" className="mt-4 text-ink-soft">
        This reset link isn&apos;t valid or has expired.{" "}
        <Link href="/forgot-password" className="font-semibold text-stamp hover:underline">Request a new one</Link>
      </p>
    );
  }

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const { error: resetError } = await authClient.resetPassword({ newPassword: password, token });
      if (resetError) {
        setError(resetError.message || "This reset link isn't valid or has expired.");
        return;
      }
      router.replace("/login");
    } catch {
      setError("Your password couldn't be changed. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      <div>
        <label htmlFor="password" className="mb-2 block text-sm font-medium text-ink">New password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          aria-describedby="password-rules"
          required
          className="w-full border border-rule-strong px-4 py-3 outline-none focus:border-stamp"
        />
        <p id="password-rules" className="mt-2 text-sm text-ink-soft">{PASSWORD_RULES}</p>
      </div>
      {error && <p role="alert" className="bg-sheet border border-stamp-red p-3 text-sm text-stamp-red">{error}</p>}
      <button type="submit" disabled={loading} className="w-full bg-ink py-3 font-semibold text-sheet hover:bg-ink-soft disabled:opacity-60">
        {loading ? "Saving..." : "Save new password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-md bg-sheet p-8 ">
        <h1 className="headline text-[34px] sm:text-[44px]">Choose a new password</h1>
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
