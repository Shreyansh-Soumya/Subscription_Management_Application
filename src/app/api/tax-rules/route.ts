
import { db } from "@/db";
import { failureResponse, invalidInput, readJson } from "@/lib/api-helpers";
import { taxRuleSchema } from "@/lib/catalog-validation";
import { authorizeRoute } from "@/lib/permissions";
import { createTaxRule, listTaxRules } from "@/lib/tax-service";

export async function GET() {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  try {
    return Response.json(await listTaxRules(db));
  } catch (error) {
    return failureResponse(error, { fallback: "Tax rules couldn't be loaded." });
  }
}

export async function POST(request: Request) {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  const parsed = taxRuleSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const rule = await createTaxRule(db, parsed.data, access.user.id);
    return Response.json(rule, { status: 201 });
  } catch (error) {
    return failureResponse(error, { fallback: "The tax rule couldn't be created." });
  }
}
