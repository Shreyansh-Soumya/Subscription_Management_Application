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
      <label htmlFor={id} className="mb-2 block text-sm font-medium text-gray-700">{label}</label>
      <input
        id={id}
        type={type}
        value={form[id]}
        onChange={(e) => setForm({ ...form, [id]: e.target.value })}
        autoComplete={type === "password" ? "new-password" : "off"}
        required
        className="w-full rounded-lg border border-gray-300 px-4 py-3 outline-none focus:border-blue-600"
      />
    </div>
  );

  return (
    <form onSubmit={handleSubmit} className="mt-8 space-y-5">
      {field("name", "Full name", "text")}
      {field("email", "Email address", "email")}
      {field("password", "Starting password", "password")}
      <p className="-mt-3 text-sm text-gray-500">{PASSWORD_RULES}</p>
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}
      {added && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{added}</p>}
      <button type="submit" disabled={loading} className="rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">
        {loading ? "Adding..." : "Add staff member"}
      </button>
    </form>
  );
}
