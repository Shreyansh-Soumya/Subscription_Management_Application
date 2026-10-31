import { db } from "@/db";
import { failureResponse, invalidInput, isValidId, notFound, readJson } from "@/lib/api-helpers";
import { variantSchema } from "@/lib/catalog-validation";
import { authorizeRoute } from "@/lib/permissions";
import { deleteProductVariant, updateProductVariant } from "@/lib/product-service";

type Context = { params: Promise<{ id: string; variantId: string }> };

export async function PUT(request: Request, { params }: Context) {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  const { id, variantId } = await params;
  if (!isValidId(id) || !isValidId(variantId)) return notFound("Variant");

  const parsed = variantSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const variant = await updateProductVariant(db, id, variantId, parsed.data, access.user.id);
    return variant ? Response.json(variant) : notFound("Variant");
  } catch (error) {
    return failureResponse(error, {
      fallback: "This variant couldn't be saved.",
      duplicate: "This product already has that variant.",
    });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  const { id, variantId } = await params;
  if (!isValidId(id) || !isValidId(variantId)) return notFound("Variant");

  try {
    const variant = await deleteProductVariant(db, id, variantId, access.user.id);
    return variant ? Response.json({ deleted: true }) : notFound("Variant");
  } catch (error) {
    return failureResponse(error, {
      fallback: "This variant couldn't be deleted.",
      reference: "This variant is on a subscription or quotation template, so it can't be deleted.",
    });
  }
}
