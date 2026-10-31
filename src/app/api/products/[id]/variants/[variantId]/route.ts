
import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeRoute } from "@/lib/permissions";
import {
  updateProductVariant,
  deleteProductVariant,
} from "@/lib/product-service";

const variantSchema = z.object({
  attribute: z.string().trim().min(1),
  value: z.string().trim().min(1),
  extraPricePaise: z.number().int().nonnegative(),
});

type Context = {
  params: Promise<{ id: string; variantId: string }>;
};

export async function PUT(request: Request, { params }: Context) {
  const access = await authorizeRoute(["admin", "staff"]);
  if ("response" in access) return access.response;

  try {
    const { id, variantId } = await params;
    const body: unknown = await request.json();
    const result = variantSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid variant details", details: result.error.flatten() },
        { status: 400 },
      );
    }

    const variant = await updateProductVariant(id, variantId, result.data);

    if (!variant) {
      return NextResponse.json(
        { error: "Variant not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(variant);
  } catch {
    return NextResponse.json(
      { error: "Unable to update variant. Check for duplicates." },
      { status: 400 },
    );
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await authorizeRoute(["admin", "staff"]);
  if ("response" in access) return access.response;

  try {
    const { id, variantId } = await params;
    const variant = await deleteProductVariant(id, variantId);

    if (!variant) {
      return NextResponse.json(
        { error: "Variant not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      message: "Variant deleted successfully",
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to delete variant" },
      { status: 500 },
    );
  }
}
