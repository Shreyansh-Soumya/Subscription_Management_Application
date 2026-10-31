import { db } from "@/db";
import { failureResponse, invalidInput, readJson } from "@/lib/api-helpers";
import { productSchema } from "@/lib/catalog-validation";
import { authorizeRoute } from "@/lib/permissions";
import { createProduct, listProducts, pageFrom } from "@/lib/product-service";

/** Staff can read the catalogue to prepare quotes. Cost price is admin-only. */
export async function GET(request: Request) {
  const access = await authorizeRoute(["admin", "staff"]);
  if ("response" in access) return access.response;

  try {
    const result = await listProducts(db, { page: pageFrom(new URL(request.url).searchParams.get("page")) });
    if (access.user.role === "admin") return Response.json(result);
    return Response.json({ ...result, rows: result.rows.map((row) => ({ ...row, costPricePaise: undefined })) });
  } catch (error) {
    return failureResponse(error, { fallback: "Products couldn't be loaded." });
  }
}

export async function POST(request: Request) {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  const parsed = productSchema.safeParse(await readJson(request));
  if (!parsed.success) return invalidInput(parsed.error);

  try {
    return Response.json(await createProduct(db, parsed.data, access.user.id), { status: 201 });
  } catch (error) {
    return failureResponse(error, {
      fallback: "This product couldn't be saved.",
      reference: "One of the chosen tax rules no longer exists.",
    });
  }
}
