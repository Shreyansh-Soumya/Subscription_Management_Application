
import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeRoute } from "@/lib/permissions";
import { createPlan, getPlans } from "@/lib/plan-service";

const planSchema = z.object({
  name: z.string().trim().min(1, "Plan name is required").max(100),
  pricePaise: z.number().int().min(0).max(2147483647),
  frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
  minQuantity: z.number().int().min(1).max(100000),
  availableFrom: z.iso.date().nullable(),
  availableTo: z.iso.date().nullable(),
  autoClose: z.boolean(),
  canCloseEarly: z.boolean(),
  canPause: z.boolean(),
  canRenew: z.boolean(),
}).refine(
  (data) =>
    !data.availableFrom ||
    !data.availableTo ||
    data.availableFrom <= data.availableTo,
  {
    message: "End date must be on or after start date",
    path: ["availableTo"],
  },
);

export async function GET(request: Request) {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  try {
    const url = new URL(request.url);
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit")) || 50, 1),
      100,
    );
    const offset = Math.max(
      Number(url.searchParams.get("offset")) || 0,
      0,
    );

    return NextResponse.json(await getPlans(limit, offset));
  } catch {
    return NextResponse.json(
      { error: "Unable to fetch plans" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  try {
    const body: unknown = await request.json();
    const result = planSchema.safeParse(body);

    if (!result.success) {
      return NextResponse.json(
        {
          error: "Invalid plan details",
          details: result.error.flatten(),
        },
        { status: 400 },
      );
    }

    const plan = await createPlan(result.data);

    return NextResponse.json(plan, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Unable to create plan" },
      { status: 500 },
    );
  }
}
