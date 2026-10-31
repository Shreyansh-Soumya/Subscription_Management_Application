
"use client";

import { useCallback, useEffect, useState } from "react";

type Frequency = "daily" | "weekly" | "monthly" | "yearly";

type Plan = {
  id: string;
  name: string;
  pricePaise: number;
  frequency: Frequency;
  minQuantity: number;
  availableFrom: string | null;
  availableTo: string | null;
  autoClose: boolean;
  canCloseEarly: boolean;
  canPause: boolean;
  canRenew: boolean;
};

const emptyForm = {
  name: "",
  price: "",
  frequency: "monthly" as Frequency,
  minQuantity: "1",
  availableFrom: "",
  availableTo: "",
  autoClose: false,
  canCloseEarly: true,
  canPause: true,
  canRenew: true,
};

const formatMoney = (paise: number) =>
  `₹${(paise / 100).toFixed(2)}`;

export default function PlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);

  const loadPlans = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/plans?limit=50&offset=${offset}`,
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load plans");
      }

      setPlans(data.items);
      setTotal(data.total);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load plans",
      );
    } finally {
      setLoading(false);
    }
  }, [offset]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  }

  function editPlan(plan: Plan) {
    setEditingId(plan.id);
    setForm({
      name: plan.name,
      price: (plan.pricePaise / 100).toFixed(2),
      frequency: plan.frequency,
      minQuantity: String(plan.minQuantity),
      availableFrom: plan.availableFrom ?? "",
      availableTo: plan.availableTo ?? "",
      autoClose: plan.autoClose,
      canCloseEarly: plan.canCloseEarly,
      canPause: plan.canPause,
      canRenew: plan.canRenew,
    });
    setShowForm(true);
    setError("");
    setMessage("");
  }

  async function savePlan() {
    const price = Number(form.price);
    const quantity = Number(form.minQuantity);
    const pricePaise = Math.round(price * 100);

    if (!form.name.trim()) {
      setError("Plan name is required.");
      return;
    }

    if (
      form.price === "" ||
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isSafeInteger(pricePaise) ||
      pricePaise > 2147483647
    ) {
      setError("Enter a valid plan price.");
      return;
    }

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 100000
    ) {
      setError("Minimum quantity must be between 1 and 100000.");
      return;
    }

    if (
      form.availableFrom &&
      form.availableTo &&
      form.availableFrom > form.availableTo
    ) {
      setError("End date must be on or after start date.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const payload = {
        name: form.name.trim(),
        pricePaise,
        frequency: form.frequency,
        minQuantity: quantity,
        availableFrom: form.availableFrom || null,
        availableTo: form.availableTo || null,
        autoClose: form.autoClose,
        canCloseEarly: form.canCloseEarly,
        canPause: form.canPause,
        canRenew: form.canRenew,
      };

      const response = await fetch(
        editingId ? `/api/plans/${editingId}` : "/api/plans",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to save plan");
      }

      setMessage(editingId ? "Plan updated." : "Plan created.");
      resetForm();
      await loadPlans();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to save plan",
      );
    } finally {
      setSaving(false);
    }
  }

  async function removePlan(id: string) {
    if (!window.confirm("Are you sure you want to delete this plan?")) {
      return;
    }

    setError("");
    setMessage("");

    try {
      const response = await fetch(`/api/plans/${id}`, {
        method: "DELETE",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to delete plan");
      }

      setMessage("Plan deleted successfully.");

      if (plans.length === 1 && offset > 0) {
        setOffset((current) => Math.max(0, current - 50));
      } else {
        await loadPlans();
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to delete plan",
      );
    }
  }

  function toggle(
    field: "autoClose" | "canCloseEarly" | "canPause" | "canRenew",
  ) {
    setForm((current) => ({
      ...current,
      [field]: !current[field],
    }));
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Subscription Plans
            </h1>
            <p className="mt-2 text-gray-500">
              Manage pricing, billing frequency, and plan rules.
            </p>
          </div>

          <button
            onClick={() => {
              if (showForm) {
                resetForm();
              } else {
                setEditingId(null);
                setForm(emptyForm);
                setShowForm(true);
              }
            }}
            className="rounded-lg bg-blue-600 px-5 py-3 text-white hover:bg-blue-700"
          >
            {showForm ? "Close Form" : "+ Add Plan"}
          </button>
        </header>

        {error && (
          <div role="alert" className="mb-4 rounded-lg bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}

        {message && (
          <div role="status" className="mb-4 rounded-lg bg-green-50 p-4 text-green-700">
            {message}
          </div>
        )}

        {showForm && (
          <section className="mb-8 rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-xl font-semibold">
              {editingId ? "Edit Plan" : "Create Plan"}
            </h2>

            <div className="grid gap-4 md:grid-cols-2">
              <label className="grid gap-2 text-sm font-medium">
                Plan name *
                <input
                  value={form.name}
                  onChange={(e) =>
                    setForm({ ...form, name: e.target.value })
                  }
                  placeholder="e.g. Premium Monthly"
                  className="rounded-lg border p-3 font-normal"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium">
                Price in rupees *
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.price}
                  onChange={(e) =>
                    setForm({ ...form, price: e.target.value })
                  }
                  placeholder="499.00"
                  className="rounded-lg border p-3 font-normal"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium">
                Billing frequency *
                <select
                  value={form.frequency}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      frequency: e.target.value as Frequency,
                    })
                  }
                  className="rounded-lg border p-3 font-normal"
                >
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </label>

              <label className="grid gap-2 text-sm font-medium">
                Minimum quantity *
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={form.minQuantity}
                  onChange={(e) =>
                    setForm({ ...form, minQuantity: e.target.value })
                  }
                  className="rounded-lg border p-3 font-normal"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium">
                Available from
                <input
                  type="date"
                  value={form.availableFrom}
                  onChange={(e) =>
                    setForm({ ...form, availableFrom: e.target.value })
                  }
                  className="rounded-lg border p-3 font-normal"
                />
              </label>

              <label className="grid gap-2 text-sm font-medium">
                Available until
                <input
                  type="date"
                  value={form.availableTo}
                  onChange={(e) =>
                    setForm({ ...form, availableTo: e.target.value })
                  }
                  className="rounded-lg border p-3 font-normal"
                />
              </label>
            </div>

            <div className="mt-7">
              <h3 className="mb-3 font-semibold">Plan settings</h3>

              <div className="grid gap-3 sm:grid-cols-2">
                {([
                  ["autoClose", "Automatically close the plan"],
                  ["canCloseEarly", "Allow early closure"],
                  ["canPause", "Allow subscription pause"],
                  ["canRenew", "Allow subscription renewal"],
                ] as const).map(([field, label]) => (
                  <label
                    key={field}
                    className="flex items-center gap-3 rounded-lg border p-4"
                  >
                    <input
                      type="checkbox"
                      checked={form[field]}
                      onChange={() => toggle(field)}
                      className="h-4 w-4"
                    />
                    <span className="text-sm">{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                disabled={saving}
                onClick={() => void savePlan()}
                className="rounded-lg bg-blue-600 px-5 py-3 text-white disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Update Plan"
                    : "Save Plan"}
              </button>

              <button
                onClick={resetForm}
                className="rounded-lg border px-5 py-3"
              >
                Cancel
              </button>
            </div>
          </section>
        )}

        <section className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-gray-100 text-gray-600">
              <tr>
                <th className="p-4">Plan</th>
                <th className="p-4">Price</th>
                <th className="p-4">Frequency</th>
                <th className="p-4">Min. quantity</th>
                <th className="p-4">Settings</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center">
                    Loading plans...
                  </td>
                </tr>
              ) : plans.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    No plans created yet.
                  </td>
                </tr>
              ) : (
                plans.map((plan) => (
                  <tr key={plan.id} className="border-t">
                    <td className="p-4 font-medium">{plan.name}</td>
                    <td className="p-4">{formatMoney(plan.pricePaise)}</td>
                    <td className="p-4 capitalize">{plan.frequency}</td>
                    <td className="p-4">{plan.minQuantity}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1 text-xs">
                        {plan.autoClose && (
                          <span className="rounded bg-blue-100 px-2 py-1 text-blue-700">
                            Auto-close
                          </span>
                        )}
                        {plan.canCloseEarly && (
                          <span className="rounded bg-gray-100 px-2 py-1">
                            Early close
                          </span>
                        )}
                        {plan.canPause && (
                          <span className="rounded bg-gray-100 px-2 py-1">
                            Pause
                          </span>
                        )}
                        {plan.canRenew && (
                          <span className="rounded bg-gray-100 px-2 py-1">
                            Renew
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-xs text-gray-500">
                        {plan.availableFrom || "No start date"} –{" "}
                        {plan.availableTo || "No end date"}
                      </p>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-3">
                        <button
                          onClick={() => editPlan(plan)}
                          className="text-blue-600"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => void removePlan(plan.id)}
                          className="text-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
          <p>
            Showing {total === 0 ? 0 : offset + 1}–
            {Math.min(offset + plans.length, total)} of {total} plans
          </p>

          <div className="flex gap-2">
            <button
              disabled={offset === 0 || loading}
              onClick={() => setOffset((current) => Math.max(0, current - 50))}
              className="rounded-lg border px-4 py-2 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              disabled={offset + 50 >= total || loading}
              onClick={() => setOffset((current) => current + 50)}
              className="rounded-lg border px-4 py-2 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
