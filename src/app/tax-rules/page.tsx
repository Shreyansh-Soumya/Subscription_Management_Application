
"use client";

import { useCallback, useEffect, useState } from "react";

type TaxRule = {
  id: string;
  name: string;
  rateBps: number;
  active: boolean;
};

const emptyForm = {
  name: "",
  rate: "18",
  active: true,
};

export default function TaxRulesPage() {
  const [rules, setRules] = useState<TaxRule[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const loadRules = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/tax-rules");
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Couldn't load tax rules.");
      setRules(data.items ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't load tax rules.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
  }

  async function saveRule(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const rate = Number(form.rate);
    if (!form.name.trim() || !Number.isFinite(rate) || rate < 0 || rate > 100) {
      setMessage("Enter a name and a tax rate between 0 and 100%.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(
        editingId ? `/api/tax-rules/${editingId}` : "/api/tax-rules",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            rateBps: Math.round(rate * 100),
            active: form.active,
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Couldn't save the tax rule.");

      setMessage(editingId ? "Tax rule updated." : "Tax rule created.");
      resetForm();
      await loadRules();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't save the tax rule.");
    } finally {
      setSaving(false);
    }
  }

  function editRule(rule: TaxRule) {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      rate: (rule.rateBps / 100).toString(),
      active: rule.active,
    });
    setMessage("");
  }

  async function removeRule(id: string) {
    if (!window.confirm("Delete this tax rule?")) return;

    setMessage("");
    try {
      const response = await fetch(`/api/tax-rules/${id}`, { method: "DELETE" });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Couldn't delete the tax rule.");

      setMessage("Tax rule deleted.");
      if (editingId === id) resetForm();
      await loadRules();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Couldn't delete the tax rule.");
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-8 p-6">
      <header>
        <h1 className="text-3xl font-bold">Tax Rules</h1>
        <p className="mt-2 text-sm text-gray-500">
          Configure the tax rates applied to products and invoices.
        </p>
      </header>

      <section className="rounded-xl border p-6">
        <h2 className="mb-5 text-xl font-semibold">
          {editingId ? "Edit tax rule" : "Create tax rule"}
        </h2>

        <form onSubmit={saveRule} className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            Tax name
            <input
              className="rounded-lg border p-3"
              placeholder="e.g. GST"
              value={form.name}
              maxLength={200}
              required
              onChange={(event) => setForm({ ...form, name: event.target.value })}
            />
          </label>

          <label className="grid gap-2 text-sm font-medium">
            Tax rate (%)
            <input
              className="rounded-lg border p-3"
              type="number"
              min="0"
              max="100"
              step="0.01"
              required
              value={form.rate}
              onChange={(event) => setForm({ ...form, rate: event.target.value })}
            />
          </label>

          <label className="flex items-center gap-3 text-sm sm:col-span-2">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm({ ...form, active: event.target.checked })}
            />
            Active tax rule
          </label>

          <div className="flex flex-wrap gap-3 sm:col-span-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-black px-5 py-3 text-white disabled:opacity-50"
            >
              {saving ? "Saving..." : editingId ? "Update tax rule" : "Create tax rule"}
            </button>

            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="rounded-lg border px-5 py-3"
              >
                Cancel
              </button>
            )}
          </div>
        </form>

        {message && <p className="mt-4 text-sm" role="status">{message}</p>}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Existing tax rules</h2>

        {loading ? (
          <p>Loading tax rules...</p>
        ) : rules.length === 0 ? (
          <p className="rounded-xl border p-6 text-gray-500">No tax rules created yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="p-4">Name</th>
                  <th className="p-4">Rate</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((rule) => (
                  <tr key={rule.id} className="border-t">
                    <td className="p-4 font-medium">{rule.name}</td>
                    <td className="p-4">{(rule.rateBps / 100).toFixed(2)}%</td>
                    <td className="p-4">
                      {rule.active ? "Active" : "Inactive"}
                    </td>
                    <td className="p-4">
                      <div className="flex gap-3">
                        <button
                          type="button"
                          className="underline"
                          onClick={() => editRule(rule)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="text-red-600 underline"
                          onClick={() => removeRule(rule.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
