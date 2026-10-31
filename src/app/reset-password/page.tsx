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
      <p role="alert" className="mt-4 text-gray-600">
        This reset link isn&apos;t valid or has expired.{" "}
        <Link href="/forgot-password" className="font-semibold text-blue-600 hover:underline">Request a new one</Link>
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
        <label htmlFor="password" className="mb-2 block text-sm font-medium text-gray-700">New password</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          aria-describedby="password-rules"
          required
          className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-600"
        />
        <p id="password-rules" className="mt-2 text-sm text-gray-500">{PASSWORD_RULES}</p>
      </div>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      <button type="submit" disabled={loading} className="w-full rounded-lg bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
        {loading ? "Saving..." : "Save new password"}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="text-3xl font-bold text-gray-900">Choose a new password</h1>
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
