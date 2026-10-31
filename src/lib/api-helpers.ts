import type { z } from "zod";
import { fieldErrorsOf, idSchema } from "./catalog-validation";

/** Thrown when a change isn't allowed. Its message is safe to show to the user. */
export class CatalogConflict extends Error {}

/** The parsed JSON body, or null when it isn't valid JSON (the schema then rejects it). */
export function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}

export function isValidId(id: string): boolean {
  return idSchema.safeParse(id).success;
}

export function notFound(what: string): Response {
  return Response.json({ error: `${what} not found.` }, { status: 404 });
}

export function invalidInput(error: z.ZodError): Response {
  return Response.json({ error: "Check the highlighted fields.", fields: fieldErrorsOf(error) }, { status: 400 });
}

/** The Postgres error code. Drizzle keeps the original database error as the cause. */
export function postgresErrorCode(error: unknown): string | undefined {
  for (let current = error; current instanceof Object; current = (current as { cause?: unknown }).cause) {
    const { code } = current as { code?: unknown };
    if (typeof code === "string") return code;
  }
  return undefined;
}

const UNIQUE_VIOLATION = "23505";
const FOREIGN_KEY_VIOLATION = "23503";

/** Turns expected database refusals into a clear 409. Anything else is a real fault: log it and return 500. */
export function failureResponse(
  error: unknown,
  messages: { fallback: string; duplicate?: string; reference?: string },
): Response {
  if (error instanceof CatalogConflict) return Response.json({ error: error.message }, { status: 409 });
  const code = postgresErrorCode(error);
  if (code === UNIQUE_VIOLATION && messages.duplicate) return Response.json({ error: messages.duplicate }, { status: 409 });
  if (code === FOREIGN_KEY_VIOLATION && messages.reference) return Response.json({ error: messages.reference }, { status: 409 });
  console.error(messages.fallback, error);
  return Response.json({ error: messages.fallback }, { status: 500 });
}
