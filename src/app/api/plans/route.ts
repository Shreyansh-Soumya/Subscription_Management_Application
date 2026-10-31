import { db } from "@/db";
import { failureResponse, invalidInput, readJson } from "@/lib/api-helpers";
import { createPlan } from "@/lib/catalog-service";
import { planSchema } from "@/lib/catalog-validation";
import { authorizeRoute } from "@/lib/permissions";

export async function POST(request: Request) {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  const parsed = planSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return Response.json(await createPlan(db, parsed.data, access.user.id), { status: 201 });
  } catch (error) {
    return failureResponse(error, { fallback: "This plan couldn't be saved." });
  }
}
