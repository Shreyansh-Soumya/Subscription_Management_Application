"use client";

import { useState, type FormEvent } from "react";
import { PASSWORD_RULES, passwordProblem } from "@/lib/password";

export function StaffForm() {
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [added, setAdded] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setAdded("");
    const problem = passwordProblem(form.password);
    if (problem) {
      setError(problem);
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/admin/staff", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || "This member of staff couldn't be added. Try again.");
        return;
      }
      setAdded(`${result.staff.email} can now log in as staff.`);
      setForm({ name: "", email: "", password: "" });
    } catch {
      setError("This member of staff couldn't be added. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const field = (id: "name" | "email" | "password", label: string, type: string) => (
    <div>
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-ink">{label}</label>
      <input
        id={id}
        type={type}
        value={form[id]}
        onChange={(e) => setForm({ ...form, [id]: e.target.value })}
        autoComplete={type === "password" ? "new-password" : "off"}
        required
        className="w-full border border-rule-strong px-4 py-3 outline-none focus:border-stamp"
      />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      {field("name", "Full name", "text")}
      {field("email", "Email address", "email")}
      {field("password", "Starting password", "password")}
      <p className="-mt-3 text-sm text-ink-soft">{PASSWORD_RULES}</p>
      {error && <p role="alert" className="bg-sheet border border-stamp-red p-3 text-sm text-stamp-red">{error}</p>}
      {added && <p role="status" className="bg-green-50 p-3 text-sm text-green-700">{added}</p>}
      <button type="submit" disabled={loading} className="bg-ink px-6 py-3 font-semibold text-sheet hover:bg-ink-soft disabled:opacity-60">
        {loading ? "Adding..." : "Add staff member"}
      </button>
    </form>
  );
}
