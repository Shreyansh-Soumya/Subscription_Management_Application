import { db } from "@/db";
import { failureResponse, invalidInput, isValidId, notFound, readJson } from "@/lib/api-helpers";
import { variantSchema } from "@/lib/catalog-validation";
import { authorizeRoute } from "@/lib/permissions";
import { createProductVariant, getProductVariants, productExists } from "@/lib/product-service";

type Context = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Context) {
  const access = await authorizeRoute(["admin", "staff"]);
  if ("response" in access) return access.response;

  const { id } = await params;
  if (!isValidId(id)) return notFound("Product");

  try {
    if (!(await productExists(db, id))) return notFound("Product");
    return Response.json(await getProductVariants(db, id));
  } catch (error) {
    return failureResponse(error, { fallback: "Variants couldn't be loaded." });
  }
}

export async function POST(request: Request, { params }: Context) {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  const { id } = await params;
  if (!isValidId(id)) return notFound("Product");

  const parsed = variantSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    if (!(await productExists(db, id))) return notFound("Product");
    return Response.json(await createProductVariant(db, id, parsed.data, access.user.id), { status: 201 });
  } catch (error) {
    return failureResponse(error, {
      fallback: "This variant couldn't be saved.",
      duplicate: "This product already has that variant.",
      reference: "This product no longer exists.",
    });
  }
}
