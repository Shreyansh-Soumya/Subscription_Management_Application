
import { NextResponse } from "next/server";
import { z } from "zod";
import { authorizeRoute } from "@/lib/permissions";
import { deletePlan, updatePlan } from "@/lib/plan-service";

const planSchema = z.object({
  name: z.string().trim().min(1).max(100),
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

type Context = {
  params: Promise<{ id: string }>;
};

export async function PUT(request: Request, { params }: Context) {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  try {
    const { id } = await params;
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

    const plan = await updatePlan(id, result.data);

    if (!plan) {
      return NextResponse.json(
        { error: "Plan not found" },
        { status: 404 },
      );
    }

    return NextResponse.json(plan);
  } catch {
    return NextResponse.json(
      { error: "Unable to update plan" },
      { status: 500 },
    );
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  try {
    const { id } = await params;
    const plan = await deletePlan(id);

    if (!plan) {
      return NextResponse.json(
        { error: "Plan not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({
      message: "Plan deleted successfully",
    });
  } catch {
    return NextResponse.json(
      {
        error: "Unable to delete plan. It may already be used by a subscription or quotation.",
      },
      { status: 409 },
    );
  }
}
