import { z } from "zod";
import { db } from "@/db";
import { authorizeRoute } from "@/lib/permissions";
import {
  applyPortalChange,
  getPortalCustomerId,
  pausePortalSubscription,
  PortalError,
  PortalNotFoundError,
  previewPortalChange,
  resumePortalSubscription,
} from "@/lib/portal";
import { TransitionError } from "@/lib/transition";

const change = z.object({
  quantities: z.record(z.uuid(), z.number()).optional(),
  addAddons: z.array(z.uuid()).max(50).optional(),
  removeLines: z.array(z.uuid()).max(50).optional(),
});
const confirmed = z.object({ change, expectedTotalPaise: z.number().int() });

const notFound = () => Response.json({ error: "Subscription not found." }, { status: 404 });

export async function POST(request: Request, { params }: { params: Promise<{ id: string; action: string }> }) {
  const access = await authorizeRoute(["customer"]);
  if ("response" in access) return access.response;

  // The customer always comes from the session, so changing the id in a URL can't reach anyone else's record.
  const customerId = await getPortalCustomerId(db, access.user.id);
  const { id, action } = await params;
  const subscriptionId = z.uuid().safeParse(id);
  if (!customerId || !subscriptionId.success) return notFound();

  const base = { customerId, subscriptionId: subscriptionId.data, actorId: access.user.id };
  const body = await request.json().catch(() => null);

  try {
    if (action === "preview") {
      const parsed = change.safeParse(body);
      if (!parsed.success) return Response.json({ error: "This change isn't valid." }, { status: 400 });
      return Response.json(await previewPortalChange(db, customerId, base.subscriptionId, parsed.data));
    }
    if (action === "change") {
      const parsed = confirmed.safeParse(body);
      if (!parsed.success) return Response.json({ error: "This change isn't valid." }, { status: 400 });
      return Response.json(await applyPortalChange(db, { ...base, ...parsed.data }));
    }
    if (action === "pause") {
      await pausePortalSubscription(db, base);
      return Response.json({ status: "paused" });
    }
    if (action === "resume") {
      await resumePortalSubscription(db, base);
      return Response.json({ status: "active" });
    }
    return notFound();
  } catch (error) {
    if (error instanceof PortalNotFoundError) return notFound();
    if (error instanceof PortalError || error instanceof TransitionError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
