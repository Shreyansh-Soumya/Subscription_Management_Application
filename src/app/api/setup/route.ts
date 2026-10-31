import { db } from "@/db";
import { failureResponse, readJson } from "@/lib/api-helpers";
import { setupSchema } from "@/lib/catalog-validation";
import { authorizeRoute } from "@/lib/permissions";
import { launchProduct } from "@/lib/setup-service";

export async function POST(request: Request) {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  const parsed = setupSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    return Response.json({ error: parsed.error.issues[0]?.message ?? "Check the details and try again." }, { status: 400 });
  }

  try {
    return Response.json(await launchProduct(db, parsed.data, access.user.id), { status: 201 });
  } catch (error) {
    return failureResponse(error, {
      fallback: "This setup couldn't be saved. Nothing was added.",
      reference: "One of the chosen tax rules no longer exists. Nothing was added.",
      duplicate: "Two of the variants are the same. Nothing was added.",
    });
  }
}
