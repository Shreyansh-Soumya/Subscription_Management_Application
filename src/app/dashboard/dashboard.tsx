
"use client";

import { useMemo, useState } from "react";

const subscriptions = [
  { id: "SUB-1001", customer: "Aarav Sharma", plan: "Premium Monthly", amount: 999, status: "Active", renewal: "Nov 02, 2026" },
  { id: "SUB-1002", customer: "Priya Das", plan: "Basic Monthly", amount: 499, status: "Active", renewal: "Nov 04, 2026" },
  { id: "SUB-1003", customer: "Rahul Verma", plan: "Business Annual", amount: 9999, status: "Paused", renewal: "Nov 08, 2026" },
  { id: "SUB-1004", customer: "Ananya Roy", plan: "Premium Monthly", amount: 999, status: "Active", renewal: "Nov 12, 2026" },
  { id: "SUB-1005", customer: "Ishaan Gupta", plan: "Basic Monthly", amount: 499, status: "Closed", renewal: "—" },
];

const plans = [
  { name: "Basic", price: "₹499", period: "/month", description: "For individuals getting started", color: "bg-blue-50 text-blue-700" },
  { name: "Premium", price: "₹999", period: "/month", description: "For growing businesses", color: "bg-violet-50 text-violet-700" },
  { name: "Business", price: "₹9,999", period: "/year", description: "For teams that need more", color: "bg-amber-50 text-amber-700" },
];

export default function Home() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");

  const filteredSubscriptions = useMemo(() => {
    return subscriptions.filter((sub) => {
      const matchesSearch =
        sub.customer.toLowerCase().includes(search.toLowerCase()) ||
        sub.id.toLowerCase().includes(search.toLowerCase()) ||
        sub.plan.toLowerCase().includes(search.toLowerCase());

      const matchesFilter = filter === "All" || sub.status === filter;
      return matchesSearch && matchesFilter;
    });
  }, [search, filter]);

  return (
    <main className="min-h-screen bg-[#f6f7fb] text-slate-900">
      <div className="flex min-h-screen">
        <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-white p-6 md:block">
          <div className="mb-12 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-600 text-xl font-bold text-white">B</div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Brightloop</h1>
              <p className="text-xs text-slate-500">Subscription management</p>
            </div>
          </div>

          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">Workspace</p>
          <nav className="space-y-2">
            <a href="#" className="flex items-center gap-3 rounded-xl bg-indigo-50 px-4 py-3 font-semibold text-indigo-700">▦ Overview</a>
            <a href="#subscriptions" className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50">↻ Subscriptions</a>
            <a href="#plans" className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50">◇ Plans & Products</a>
            <a href="#subscriptions" className="flex items-center gap-3 rounded-xl px-4 py-3 text-slate-600 hover:bg-slate-50">▤ Invoices</a>
          </nav>

          <div className="mt-12 rounded-2xl bg-slate-50 p-4">
            <p className="text-sm font-semibold">Need help?</p>
            <p className="mt-1 text-xs leading-5 text-slate-500">Manage your subscriptions with confidence.</p>
            <p className="mt-3 text-sm font-semibold text-indigo-600">Help center →</p>
          </div>

          <div className="mt-auto pt-10">
            <div className="flex items-center gap-3 border-t border-slate-100 pt-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-100 font-bold text-indigo-700">A</div>
              <div>
                <p className="text-sm font-semibold">Admin User</p>
                <p className="text-xs text-slate-500">Administrator</p>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 p-5 sm:p-8 lg:p-10">
          <header className="mb-9 flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-slate-500">Saturday, October 31, 2026</p>
              <h2 className="mt-1 text-3xl font-bold tracking-tight">Dashboard overview</h2>
              <p className="mt-2 text-sm text-slate-500">Here&apos;s what&apos;s happening with your subscriptions.</p>
            </div>
            <a href="#subscriptions" className="rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700">
              View subscriptions →
            </a>
          </header>

          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Total subscriptions", value: "248", change: "+12.8%", icon: "↻" },
              { label: "Active subscriptions", value: "186", change: "+8.2%", icon: "✓" },
              { label: "Monthly revenue", value: "₹1,84,500", change: "+14.5%", icon: "₹" },
              { label: "Pending invoices", value: "12", change: "Needs attention", icon: "!" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-slate-500">{stat.label}</p>
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 font-bold text-indigo-600">{stat.icon}</span>
                </div>
                <p className="mt-4 text-2xl font-bold tracking-tight">{stat.value}</p>
                <p className="mt-2 text-xs font-semibold text-emerald-600">{stat.change}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
            <div className="rounded-2xl border border-slate-200 bg-white p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-bold">Revenue snapshot</h3>
                  <p className="mt-1 text-sm text-slate-500">Illustrative monthly performance</p>
                </div>
                <span className="rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">+14.5%</span>
              </div>
              <div className="mt-8 flex h-40 items-end justify-between gap-3">
                {[45, 62, 52, 75, 65, 88, 72, 96, 78, 100, 85, 92].map((height, i) => (
                  <div key={i} className="flex h-full flex-1 flex-col justify-end">
                    <div className="w-full rounded-t-lg bg-indigo-500 hover:bg-indigo-700" style={{ height: `${height}%` }} />
                  </div>
                ))}
              </div>
              <div className="mt-3 flex justify-between text-xs text-slate-400">
                <span>Jan</span><span>Mar</span><span>May</span><span>Jul</span><span>Sep</span><span>Dec</span>
              </div>
            </div>

            <div id="plans" className="rounded-2xl border border-slate-200 bg-white p-6">
              <h3 className="font-bold">Popular plans</h3>
              <p className="mt-1 text-sm text-slate-500">Your subscription offerings</p>
              <div className="mt-5 space-y-4">
                {plans.map((plan) => (
                  <div key={plan.name} className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4 last:border-0 last:pb-0">
                    <div>
                      <span className={`rounded-md px-2 py-1 text-xs font-semibold ${plan.color}`}>{plan.name}</span>
                      <p className="mt-2 text-xs text-slate-500">{plan.description}</p>
                    </div>
                    <p className="whitespace-nowrap font-bold">{plan.price}<span className="text-xs font-normal text-slate-400">{plan.period}</span></p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div id="subscriptions" className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold">Recent subscriptions</h3>
                <p className="mt-1 text-sm text-slate-500">Search and filter your customer subscriptions.</p>
              </div>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer, ID or plan..."
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-indigo-500 sm:w-72"
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              {["All", "Active", "Paused", "Closed"].map((item) => (
                <button
                  key={item}
                  onClick={() => setFilter(item)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium ${filter === item ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  {item}
                </button>
              ))}
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[650px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                    <th className="pb-3 font-semibold">Subscription</th>
                    <th className="pb-3 font-semibold">Customer</th>
                    <th className="pb-3 font-semibold">Plan</th>
                    <th className="pb-3 font-semibold">Amount</th>
                    <th className="pb-3 font-semibold">Status</th>
                    <th className="pb-3 font-semibold">Renewal</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubscriptions.map((sub) => (
                    <tr key={sub.id} className="border-b border-slate-50 last:border-0">
                      <td className="py-4 font-semibold text-indigo-700">{sub.id}</td>
                      <td className="py-4">{sub.customer}</td>
                      <td className="py-4 text-slate-600">{sub.plan}</td>
                      <td className="py-4 font-semibold">₹{sub.amount.toLocaleString("en-IN")}</td>
                      <td className="py-4">
                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${sub.status === "Active" ? "bg-emerald-50 text-emerald-700" : sub.status === "Paused" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}>
                          {sub.status}
                        </span>
                      </td>
                      <td className="py-4 text-slate-500">{sub.renewal}</td>
                    </tr>
                  ))}
                  {filteredSubscriptions.length === 0 && (
                    <tr><td colSpan={6} className="py-8 text-center text-slate-500">No subscriptions found.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-xs text-slate-400">Demo data for the dashboard prototype. We&apos;ll connect real database records next.</p>
          </div>
        </section>
      </div>
    </main>
  );
}
