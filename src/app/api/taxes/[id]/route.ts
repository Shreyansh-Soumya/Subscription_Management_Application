import { db } from "@/db";
import { failureResponse, invalidInput, isValidId, notFound, readJson } from "@/lib/api-helpers";
import { deleteTaxRule, updateTaxRule } from "@/lib/catalog-service";
import { taxRuleSchema } from "@/lib/catalog-validation";
import { authorizeRoute } from "@/lib/permissions";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  const { id } = await params;
  if (!isValidId(id)) return notFound("Tax rule");

  const parsed = taxRuleSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const rule = await updateTaxRule(db, id, parsed.data, access.user.id);
    return rule ? Response.json(rule) : notFound("Tax rule");
  } catch (error) {
    return failureResponse(error, { fallback: "This tax rule couldn't be saved." });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  const { id } = await params;
  if (!isValidId(id)) return notFound("Tax rule");

  try {
    const rule = await deleteTaxRule(db, id, access.user.id);
    return rule ? Response.json({ deleted: true }) : notFound("Tax rule");
  } catch (error) {
    return failureResponse(error, {
      fallback: "This tax rule couldn't be deleted.",
      reference: "This tax is on a subscription, so it can't be deleted. Mark it inactive instead.",
    });
  }
}
