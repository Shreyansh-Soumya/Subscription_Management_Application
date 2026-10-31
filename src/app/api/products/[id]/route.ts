
import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeRoute } from "@/lib/permissions";
import { updateProduct, deleteProduct } from "@/lib/product-service";

const productSchema = z.object({
  name: z.string().trim().min(1),
  type: z.string().trim().min(1),
  salesPricePaise: z.number().int().nonnegative(),
  costPricePaise: z.number().int().nonnegative(),
  notes: z.string().optional(),
  isAddon: z.boolean().default(false),
});

type Context = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, { params }: Context) {
  const access = await authorizeRoute(["admin", "staff"]);
  if ("response" in access) return access.response;

  try {
    const { id } = await params;
    const body: unknown = await request.json();
    const result = productSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid product details", details: result.error.flatten() },
        { status: 400 },
      );
    }

    const product = await updateProduct(id, result.data);

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(product);
  } catch {
    return NextResponse.json(
      { error: "Unable to update product" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await authorizeRoute(["admin", "staff"]);
  if ("response" in access) return access.response;

  try {
    const { id } = await params;
    const product = await deleteProduct(id);

    if (!product) {
      return NextResponse.json(
        { error: "Product not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      message: "Product deleted successfully",
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to delete product" },
      { status: 500 },
    );
  }
}
