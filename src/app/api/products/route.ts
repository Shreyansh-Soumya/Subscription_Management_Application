
import { NextResponse } from "next/server";
import { z } from "zod";
import { createProduct, getProducts } from "@/lib/product-service";
import { authorizeRoute } from "@/lib/permissions";

const productSchema = z.object({
  name: z.string().trim().min(1, "Product name is required"),
  type: z.string().trim().min(1, "Product type is required"),
  salesPricePaise: z.number().int().nonnegative(),
  costPricePaise: z.number().int().nonnegative(),
  notes: z.string().optional(),
  isAddon: z.boolean().default(false),
});

export async function GET() {
  const access = await authorizeRoute(["admin", "staff"]);

  if ("response" in access) {
    return access.response;
  }

  try {
    const products = await getProducts();
    return NextResponse.json(products);
  } catch {
    return NextResponse.json(
      { error: "Unable to fetch products" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const access = await authorizeRoute(["admin", "staff"]);

  if ("response" in access) {
    return access.response;
  }

  try {
    const body: unknown = await request.json();
    const result = productSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Invalid product details",
          details: result.error.flatten(),
        },
        { status: 400 },
      );
    }

    const product = await createProduct(result.data);

    return NextResponse.json(product, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Unable to create product" },
      { status: 500 },
    );
  }
}
