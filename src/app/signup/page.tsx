
"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_RULES, passwordProblem } from "@/lib/password";

export default function SignupPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignup = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    setError("");
    const problem = passwordProblem(password);
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);

    try {
      const { error: signupError } = await authClient.signUp.email({
        name,
        email,
        password,
      });

      if (signupError) {
        setError(signupError.message || "Unable to create your account.");
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
          Create your account
        </h1>

        <p className="mt-2 text-sm text-ink-soft">
          Join Brightloop to manage your subscriptions.
        </p>

        <form onSubmit={handleSignup} className="mt-8 space-y-5">
          <div>
            <label htmlFor="name" className="mb-2 block text-sm font-medium text-ink">
              Full name
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              autoComplete="name"
              required
              className="w-full border border-rule-strong px-4 py-3 outline-none focus:border-stamp"
            />
          </div>

          <div>
            <label htmlFor="email" className="mb-2 block text-sm font-medium text-ink">
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
              className="w-full border border-rule-strong px-4 py-3 outline-none focus:border-stamp"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-2 block text-sm font-medium text-ink">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Choose a password"
              autoComplete="new-password"
              minLength={9}
              aria-describedby="password-rules"
              required
              className="w-full border border-rule-strong px-4 py-3 outline-none focus:border-stamp"
            />
          </div>

          <p id="password-rules" className="-mt-3 text-sm text-ink-soft">{PASSWORD_RULES}</p>

          {error && (
            <p role="alert" className="bg-sheet border border-stamp-red p-3 text-sm text-stamp-red">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-ink py-3 font-semibold text-sheet transition hover:bg-ink-soft disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Creating account..." : "Create account"}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-ink-soft">
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-stamp hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
