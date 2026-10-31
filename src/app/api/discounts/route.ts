import { db } from "@/db";
import { failureResponse, invalidInput, readJson } from "@/lib/api-helpers";
import { createDiscount } from "@/lib/catalog-service";
import { discountSchema } from "@/lib/catalog-validation";
import { authorizeRoute } from "@/lib/permissions";

export async function POST(request: Request) {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  const parsed = discountSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return Response.json(await createDiscount(db, parsed.data, access.user.id), { status: 201 });
  } catch (error) {
    return failureResponse(error, {
      fallback: "This discount couldn't be saved.",
      reference: "One of the chosen products no longer exists.",
    });
  }
}
