
import { db } from "@/db";
import {
  failureResponse,
  invalidInput,
  isValidId,
  notFound,
  readJson,
} from "@/lib/api-helpers";
import { taxRuleSchema } from "@/lib/catalog-validation";
import { authorizeRoute } from "@/lib/permissions";
import { deleteTaxRule, updateTaxRule } from "@/lib/tax-service";

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
    return failureResponse(error, { fallback: "The tax rule couldn't be updated." });
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
      fallback: "The tax rule couldn't be deleted.",
      reference: "This tax rule is used by an existing subscription and can't be deleted.",
    });
  }
}
