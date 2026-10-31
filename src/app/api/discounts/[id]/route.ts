import { db } from "@/db";
import { failureResponse, invalidInput, isValidId, notFound, readJson } from "@/lib/api-helpers";
import { deleteDiscount, updateDiscount } from "@/lib/catalog-service";
import { discountSchema } from "@/lib/catalog-validation";
import { authorizeRoute } from "@/lib/permissions";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  const { id } = await params;
  if (!isValidId(id)) return notFound("Discount");

  const parsed = discountSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const discount = await updateDiscount(db, id, parsed.data, access.user.id);
    return discount ? Response.json(discount) : notFound("Discount");
  } catch (error) {
    return failureResponse(error, {
      fallback: "This discount couldn't be saved.",
      reference: "One of the chosen products no longer exists.",
    });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  const { id } = await params;
  if (!isValidId(id)) return notFound("Discount");

  try {
    const discount = await deleteDiscount(db, id, access.user.id);
    return discount ? Response.json({ deleted: true }) : notFound("Discount");
  } catch (error) {
    return failureResponse(error, { fallback: "This discount couldn't be deleted." });
  }
}
