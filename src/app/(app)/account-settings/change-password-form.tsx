"use client";

import { useState, type FormEvent } from "react";
import { FormField } from "@/components/app/form-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";
import { PASSWORD_RULES, passwordProblem } from "@/lib/password";

export function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSaved(false);
    const problem = passwordProblem(newPassword);
    if (problem) {
      setError(problem);
      return;
    }
    setError("");
    setBusy(true);
    try {
      const { error: changeError } = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
      if (changeError) {
        setError(changeError.message || "Your password couldn't be changed. Try again.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setSaved(true);
    } catch {
      setError("Your password couldn't be changed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="mt-8 grid max-w-md gap-4">
      <h2 className="text-lg font-semibold">Change your password</h2>
      <FormField label="Current password" htmlFor="current-password" required>
        <Input id="current-password" type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
      </FormField>
      <FormField label="New password" htmlFor="new-password" hint={PASSWORD_RULES} required>
        <Input id="new-password" type="password" autoComplete="new-password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
      </FormField>
      {error && <p role="alert" className="border border-stamp-red p-3 text-sm text-stamp-red">{error}</p>}
      {saved && <p role="status" className="border border-paid p-3 text-sm font-medium text-paid">Password changed.</p>}
      <div><Button type="submit" disabled={busy}>{busy ? "Saving..." : "Change password"}</Button></div>
    </form>
  );
}
