
"use client";

import { Fragment, useCallback, useEffect, useState } from "react";

type Product = {
  id: string;
  name: string;
  type: string;
  salesPricePaise: number;
  costPricePaise: number;
  notes: string | null;
  isAddon: boolean;
};

type Variant = {
  id: string;
  productId: string;
  attribute: string;
  value: string;
  extraPricePaise: number;
};

const emptyForm = {
  name: "",
  type: "",
  price: "",
  costPrice: "",
  notes: "",
  isAddon: false,
};

const money = (paise: number) => `₹${(paise / 100).toFixed(2)}`;
const paise = (rupees: string) => Math.round(Number(rupees) * 100);

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantForm, setVariantForm] = useState({
    attribute: "",
    value: "",
    price: "",
  });

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/products");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Unable to load products");
      }

      setProducts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load products");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  function resetForm() {
    setForm(emptyForm);
    setEditingId(null);
    setShowForm(false);
  }

  async function saveProduct() {
    if (
      !form.name.trim() ||
      !form.type.trim() ||
      form.price === "" ||
      form.costPrice === ""
    ) {
      setError("Please fill in all required fields.");
      return;
    }

    const selling = Number(form.price);
    const cost = Number(form.costPrice);

    if (
      !Number.isFinite(selling) ||
      !Number.isFinite(cost) ||
      selling < 0 ||
      cost < 0 ||
      paise(form.price) > 2147483647 ||
      paise(form.costPrice) > 2147483647
    ) {
      setError("Please enter valid prices.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch(
        editingId ? `/api/products/${editingId}` : "/api/products",
        {
          method: editingId ? "PUT" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: form.name.trim(),
            type: form.type.trim(),
            salesPricePaise: paise(form.price),
            costPricePaise: paise(form.costPrice),
            notes: form.notes.trim() || undefined,
            isAddon: form.isAddon,
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save product");

      setMessage(editingId ? "Product updated." : "Product created.");
      resetForm();
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save product");
    } finally {
      setSaving(false);
    }
  }

  function editProduct(product: Product) {
    setEditingId(product.id);
    setForm({
      name: product.name,
      type: product.type,
      price: (product.salesPricePaise / 100).toFixed(2),
      costPrice: (product.costPricePaise / 100).toFixed(2),
      notes: product.notes ?? "",
      isAddon: product.isAddon,
    });
    setShowForm(true);
  }

  async function removeProduct(id: string) {
    if (!window.confirm("Delete this product and its variants?")) return;

    try {
      const response = await fetch(`/api/products/${id}`, {
        method: "DELETE",
      });
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Unable to delete product");

      setMessage("Product deleted.");
      if (expandedId === id) {
        setExpandedId(null);
        setVariants([]);
      }
      await loadProducts();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete product");
    }
  }

  async function toggleVariants(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setVariants([]);
      return;
    }

    setExpandedId(id);
    setVariants([]);
    setError("");

    try {
      const response = await fetch(`/api/products/${id}/variants`);
      const data = await response.json();

      if (!response.ok) throw new Error(data.error || "Unable to load variants");
      setVariants(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load variants");
    }
  }

  async function saveVariant(productId: string) {
    const price = Number(variantForm.price);

    if (
      !variantForm.attribute.trim() ||
      !variantForm.value.trim() ||
      variantForm.price === "" ||
      !Number.isFinite(price) ||
      price < 0 ||
      paise(variantForm.price) > 2147483647
    ) {
      setError("Enter a valid attribute, value, and price.");
      return;
    }

    try {
      const response = await fetch(`/api/products/${productId}/variants`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          attribute: variantForm.attribute.trim(),
          value: variantForm.value.trim(),
          extraPricePaise: paise(variantForm.price),
        }),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to add variant");

      setVariants((current) => [...current, data]);
      setVariantForm({ attribute: "", value: "", price: "" });
      setMessage("Variant added.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to add variant");
    }
  }

  async function editVariant(variant: Variant) {
    const attribute = window.prompt("Attribute:", variant.attribute);
    if (attribute === null) return;

    const value = window.prompt("Value:", variant.value);
    if (value === null) return;

    const price = window.prompt(
      "Extra price in rupees:",
      (variant.extraPricePaise / 100).toFixed(2),
    );
    if (price === null) return;

    const amount = Number(price);
    if (
      !attribute.trim() ||
      !value.trim() ||
      !Number.isFinite(amount) ||
      amount < 0 ||
      Math.round(amount * 100) > 2147483647
    ) {
      setError("Invalid variant details.");
      return;
    }

    try {
      const response = await fetch(
        `/api/products/${variant.productId}/variants/${variant.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            attribute: attribute.trim(),
            value: value.trim(),
            extraPricePaise: Math.round(amount * 100),
          }),
        },
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to edit variant");

      setVariants((current) =>
        current.map((item) => item.id === variant.id ? data : item),
      );
      setMessage("Variant updated.");
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to edit variant");
    }
  }

  async function removeVariant(variant: Variant) {
    if (!window.confirm("Delete this variant?")) return;

    try {
      const response = await fetch(
        `/api/products/${variant.productId}/variants/${variant.id}`,
        { method: "DELETE" },
      );

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to delete variant");

      setVariants((current) =>
        current.filter((item) => item.id !== variant.id),
      );
      setMessage("Variant deleted.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete variant");
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Products</h1>
            <p className="mt-2 text-gray-500">
              Manage products, pricing, and variants.
            </p>
          </div>
          <button
            onClick={() => {
              if (showForm) resetForm();
              else {
                setEditingId(null);
                setForm(emptyForm);
                setShowForm(true);
              }
            }}
            className="rounded-lg bg-blue-600 px-5 py-3 text-white hover:bg-blue-700"
          >
            {showForm ? "Close Form" : "+ Add Product"}
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
              {editingId ? "Edit Product" : "Add New Product"}
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <input
                placeholder="Product Name *"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="rounded-lg border p-3"
              />
              <input
                placeholder="Product Type *"
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="rounded-lg border p-3"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Selling Price (₹) *"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
                className="rounded-lg border p-3"
              />
              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Cost Price (₹) *"
                value={form.costPrice}
                onChange={(e) => setForm({ ...form, costPrice: e.target.value })}
                className="rounded-lg border p-3"
              />
              <input
                placeholder="Notes (optional)"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="rounded-lg border p-3 md:col-span-2"
              />
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isAddon}
                  onChange={(e) => setForm({ ...form, isAddon: e.target.checked })}
                />
                Add-on product
              </label>
            </div>
            <div className="mt-6 flex gap-3">
              <button
                disabled={saving}
                onClick={() => void saveProduct()}
                className="rounded-lg bg-blue-600 px-5 py-3 text-white disabled:opacity-50"
              >
                {saving ? "Saving..." : editingId ? "Update Product" : "Save Product"}
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
                <th className="p-4">Product</th>
                <th className="p-4">Type</th>
                <th className="p-4">Selling Price</th>
                <th className="p-4">Cost Price</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center">Loading...</td>
                </tr>
              ) : products.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500">
                    No products available.
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <Fragment key={product.id}>
                    <tr className="border-t">
                      <td className="p-4 font-medium">
                        {product.name}
                        {product.isAddon && (
                          <span className="ml-2 rounded bg-purple-100 px-2 py-1 text-xs text-purple-700">
                            Add-on
                          </span>
                        )}
                      </td>
                      <td className="p-4">{product.type}</td>
                      <td className="p-4">{money(product.salesPricePaise)}</td>
                      <td className="p-4">{money(product.costPricePaise)}</td>
                      <td className="p-4">
                        <div className="flex flex-wrap gap-3">
                          <button onClick={() => editProduct(product)} className="text-blue-600">
                            Edit
                          </button>
                          <button onClick={() => void removeProduct(product.id)} className="text-red-600">
                            Delete
                          </button>
                          <button onClick={() => void toggleVariants(product.id)} className="text-purple-600">
                            {expandedId === product.id ? "Hide Variants" : "Variants"}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {expandedId === product.id && (
                      <tr className="border-t bg-gray-50">
                        <td colSpan={5} className="p-5">
                          <h3 className="mb-4 font-semibold">
                            Variants for {product.name}
                          </h3>
                          {variants.length === 0 ? (
                            <p className="mb-4 text-sm text-gray-500">
                              No variants added yet.
                            </p>
                          ) : (
                            <div className="mb-5 space-y-2">
                              {variants.map((variant) => (
                                <div key={variant.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-white p-3">
                                  <span>
                                    <strong>{variant.attribute}:</strong> {variant.value}
                                    <span className="ml-3 text-sm text-gray-500">
                                      +{money(variant.extraPricePaise)}
                                    </span>
                                  </span>
                                  <div className="flex gap-3">
                                    <button onClick={() => void editVariant(variant)} className="text-blue-600">
                                      Edit
                                    </button>
                                    <button onClick={() => void removeVariant(variant)} className="text-red-600">
                                      Delete
                                    </button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="grid gap-3 md:grid-cols-4">
                            <input
                              placeholder="Attribute (e.g. Brand)"
                              value={variantForm.attribute}
                              onChange={(e) => setVariantForm({ ...variantForm, attribute: e.target.value })}
                              className="rounded-lg border bg-white p-3"
                            />
                            <input
                              placeholder="Value (e.g. Odoo)"
                              value={variantForm.value}
                              onChange={(e) => setVariantForm({ ...variantForm, value: e.target.value })}
                              className="rounded-lg border bg-white p-3"
                            />
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              placeholder="Extra price (₹)"
                              value={variantForm.price}
                              onChange={(e) => setVariantForm({ ...variantForm, price: e.target.value })}
                              className="rounded-lg border bg-white p-3"
                            />
                            <button
                              onClick={() => void saveVariant(product.id)}
                              className="rounded-lg bg-purple-600 px-4 py-3 text-white hover:bg-purple-700"
                            >
                              Add Variant
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </section>

        <p className="mt-4 text-sm text-gray-500">
          Total Products: {products.length}
        </p>
      </div>
    </main>
  );
}
