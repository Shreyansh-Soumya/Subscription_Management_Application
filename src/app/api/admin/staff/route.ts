import { z } from "zod";
import { db } from "@/db";
import { AccountError, createStaffMember } from "@/lib/accounts";
import { authorizeRoute } from "@/lib/permissions";

const body = z.object({ name: z.string(), email: z.string(), password: z.string() });

export async function POST(request: Request) {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Enter a name, email and password." }, { status: 400 });

  try {
    const staff = await createStaffMember(db, { ...parsed.data, actorId: access.user.id });
    return Response.json({ staff }, { status: 201 });
  } catch (error) {
    if (error instanceof AccountError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
