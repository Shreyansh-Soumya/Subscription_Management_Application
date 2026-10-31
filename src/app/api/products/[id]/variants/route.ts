
import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeRoute } from "@/lib/permissions";
import {
  getProductVariants,
  createProductVariant,
} from "@/lib/product-service";

const variantSchema = z.object({
  attribute: z.string().trim().min(1),
  value: z.string().trim().min(1),
  extraPricePaise: z.number().int().nonnegative(),
});

type Context = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, { params }: Context) {
  const access = await authorizeRoute(["admin", "staff"]);
  if ("response" in access) return access.response;

  try {
    const { id } = await params;
    return NextResponse.json(await getProductVariants(id));
  } catch {
    return NextResponse.json(
      { error: "Unable to fetch variants" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request, { params }: Context) {
  const access = await authorizeRoute(["admin", "staff"]);
  if ("response" in access) return access.response;

  try {
    const { id } = await params;
    const body: unknown = await request.json();
    const result = variantSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        { error: "Invalid variant details", details: result.error.flatten() },
        { status: 400 },
      );
    }

    const variant = await createProductVariant(id, result.data);
    return NextResponse.json(variant, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Unable to create variant. Check for duplicates or an invalid product." },
      { status: 400 },
    );
  }
}
