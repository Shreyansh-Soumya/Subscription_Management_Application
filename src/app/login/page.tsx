
"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const { error: loginError } = await authClient.signIn.email({
        email,
        password,
      });

      if (loginError) {
        setError(loginError.message || "Invalid email or password.");
        return;
      }

      router.replace("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-4 py-10">
      <div className="w-full max-w-md bg-sheet p-8 ">
        <h1 className="headline text-[34px] sm:text-[44px]">
          Welcome back
        </h1>

        <p className="mt-2 text-sm text-ink-soft">
          Sign in to your Brightloop account.
        </p>

        <form onSubmit={handleLogin} className="mt-8 space-y-5">
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-sm font-medium text-ink"
            >
              Email address
            </label>

            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
              required
              className="w-full border border-rule-strong px-4 py-3 outline-none focus:border-stamp focus:ring-2 focus:ring-rule"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-sm font-medium text-ink"
            >
              Password
            </label>

            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              required
              className="w-full border border-rule-strong px-4 py-3 outline-none focus:border-stamp focus:ring-2 focus:ring-rule"
            />
          </div>

          <p className="-mt-3 text-right text-sm">
            <Link href="/forgot-password" className="font-semibold text-stamp hover:underline">
              Forgot your password?
            </Link>
          </p>

          {error && (
            <p className="bg-sheet border border-stamp-red p-3 text-sm text-stamp-red" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-ink py-3 font-semibold text-sheet transition hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-soft">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-semibold text-stamp hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
