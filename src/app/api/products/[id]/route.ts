import { db } from "@/db";
import { failureResponse, invalidInput, isValidId, notFound, readJson } from "@/lib/api-helpers";
import { productSchema } from "@/lib/catalog-validation";
import { authorizeRoute } from "@/lib/permissions";
import { deleteProduct, updateProduct } from "@/lib/product-service";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  const { id } = await params;
  if (!isValidId(id)) return notFound("Product");

  const parsed = productSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const product = await updateProduct(db, id, parsed.data, access.user.id);
    return product ? Response.json(product) : notFound("Product");
  } catch (error) {
    return failureResponse(error, {
      fallback: "This product couldn't be saved.",
      reference: "One of the chosen tax rules no longer exists.",
    });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  const { id } = await params;
  if (!isValidId(id)) return notFound("Product");

  try {
    const product = await deleteProduct(db, id, access.user.id);
    return product ? Response.json({ deleted: true }) : notFound("Product");
  } catch (error) {
    return failureResponse(error, {
      fallback: "This product couldn't be deleted.",
      reference: "This product is on a subscription, invoice or quotation template, so it can't be deleted.",
    });
  }
}
