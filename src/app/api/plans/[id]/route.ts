import { db } from "@/db";
import { failureResponse, invalidInput, isValidId, notFound, readJson } from "@/lib/api-helpers";
import { deletePlan, updatePlan } from "@/lib/catalog-service";
import { planSchema } from "@/lib/catalog-validation";
import { authorizeRoute } from "@/lib/permissions";

type Context = { params: Promise<{ id: string }> };

export async function PUT(request: Request, { params }: Context) {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  const { id } = await params;
  if (!isValidId(id)) return notFound("Plan");

  const parsed = planSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    const plan = await updatePlan(db, id, parsed.data, access.user.id);
    return plan ? Response.json(plan) : notFound("Plan");
  } catch (error) {
    return failureResponse(error, { fallback: "This plan couldn't be saved." });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  const { id } = await params;
  if (!isValidId(id)) return notFound("Plan");

  try {
    const plan = await deletePlan(db, id, access.user.id);
    return plan ? Response.json({ deleted: true }) : notFound("Plan");
  } catch (error) {
    return failureResponse(error, {
      fallback: "This plan couldn't be deleted.",
      reference: "This plan is on a subscription or quotation template, so it can't be deleted.",
    });
  }
}
