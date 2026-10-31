import { z } from "zod";
import { db } from "@/db";
import { authorizeRoute } from "@/lib/permissions";
import { jumpToDate, returnToRealDate, TimeMachineError } from "@/lib/time-machine";

const body = z.union([z.object({ date: z.string() }), z.object({ returnToRealDate: z.literal(true) })]);

export async function POST(request: Request) {
  const access = await authorizeRoute(["admin"]);
  if ("response" in access) return access.response;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Choose a date." }, { status: 400 });

  if ("returnToRealDate" in parsed.data) {
    await returnToRealDate(db, { actorId: access.user.id });
    return Response.json({ returned: true });
  }

  try {
    return Response.json(await jumpToDate(db, { date: parsed.data.date, actorId: access.user.id }));
  } catch (error) {
    if (error instanceof TimeMachineError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}
