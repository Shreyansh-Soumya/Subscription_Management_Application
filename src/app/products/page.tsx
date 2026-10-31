


"use client";

import { useState } from "react";

type Product = {
  id: number;
  name: string;
  type: string;
  price: number;
  costPrice: number;
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([
    {
      id: 1,
      name: "Basic Plan",
      type: "Subscription",
      price: 499,
      costPrice: 200,
    },
    {
      id: 2,
      name: "Premium Plan",
      type: "Subscription",
      price: 999,
      costPrice: 450,
    },
  ]);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [price, setPrice] = useState("");
  const [costPrice, setCostPrice] = useState("");

  const resetForm = () => {
    setName("");
    setType("");
    setPrice("");
    setCostPrice("");
    setShowForm(false);
  };

  const handleAddProduct = () => {
    if (
      !name.trim() ||
      !type.trim() ||
      price === "" ||
      costPrice === ""
    ) {
      alert("Please fill all fields.");
      return;
    }

    const sellingPrice = Number(price);
    const productCost = Number(costPrice);

    if (
      !Number.isFinite(sellingPrice) ||
      !Number.isFinite(productCost) ||
      sellingPrice < 0 ||
      productCost < 0
    ) {
      alert("Please enter valid, non-negative prices.");
      return;
    }

    const newProduct: Product = {
      id: Date.now(),
      name: name.trim(),
      type: type.trim(),
      price: sellingPrice,
      costPrice: productCost,
    };

    setProducts((currentProducts) => [
      ...currentProducts,
      newProduct,
    ]);

    resetForm();
  };

  const handleDeleteProduct = (id: number) => {
    const confirmed = window.confirm(
      "Are you sure you want to delete this product?"
    );

    if (!confirmed) return;

    setProducts((currentProducts) =>
      currentProducts.filter((product) => product.id !== id)
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-6xl">

        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">
              Products
            </h1>
            <p className="mt-2 text-gray-500">
              Manage your products and pricing.
            </p>
          </div>

          <button
            onClick={() => setShowForm(!showForm)}
            className="rounded-lg bg-blue-600 px-5 py-3 text-white hover:bg-blue-700"
          >
            + Add Product
          </button>
        </div>

        {/* Add Product Form */}
        {showForm && (
          <div className="mb-8 rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="mb-5 text-xl font-semibold text-gray-900">
              Add New Product
            </h2>

            <div className="grid gap-4 md:grid-cols-2">
              <input
                type="text"
                placeholder="Product Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="rounded-lg border p-3"
              />

              <input
                type="text"
                placeholder="Product Type"
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="rounded-lg border p-3"
              />

              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Selling Price (₹)"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                className="rounded-lg border p-3"
              />

              <input
                type="number"
                min="0"
                step="0.01"
                placeholder="Cost Price (₹)"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value)}
                className="rounded-lg border p-3"
              />
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleAddProduct}
                className="rounded-lg bg-blue-600 px-5 py-3 text-white hover:bg-blue-700"
              >
                Save Product
              </button>

              <button
                onClick={resetForm}
                className="rounded-lg border px-5 py-3 text-gray-700 hover:bg-gray-100"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Products Table */}
        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <table className="w-full text-left">
            <thead className="bg-gray-100 text-gray-600">
              <tr>
                <th className="p-4">Product Name</th>
                <th className="p-4">Type</th>
                <th className="p-4">Selling Price</th>
                <th className="p-4">Cost Price</th>
                <th className="p-4">Actions</th>
              </tr>
            </thead>

            <tbody>
              {products.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="p-8 text-center text-gray-500"
                  >
                    No products available. Add your first product.
                  </td>
                </tr>
              ) : (
                products.map((product) => (
                  <tr key={product.id} className="border-t">
                    <td className="p-4 font-medium text-gray-900">
                      {product.name}
                    </td>

                    <td className="p-4 text-gray-600">
                      {product.type}
                    </td>

                    <td className="p-4 text-gray-600">
                      ₹{product.price.toFixed(2)}
                    </td>

                    <td className="p-4 text-gray-600">
                      ₹{product.costPrice.toFixed(2)}
                    </td>

                    <td className="p-4">
                      <button
                        onClick={() =>
                          handleDeleteProduct(product.id)
                        }
                        className="text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Product Count */}
        <p className="mt-4 text-sm text-gray-500">
          Total Products: {products.length}
        </p>
      </div>
    </div>
  );
}
