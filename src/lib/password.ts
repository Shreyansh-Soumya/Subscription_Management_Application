export const PASSWORD_RULES = "Use more than 8 characters, with an uppercase letter, a lowercase letter and a special character.";

const MIN_LENGTH = 9;
const MAX_LENGTH = 128;

/** Returns what's wrong with a password, or null if it's fine. Runs on the server and in forms. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_LENGTH) return "Use more than 8 characters.";
  if (password.length > MAX_LENGTH) return "Use 128 characters or fewer.";
  if (!/\p{Lu}/u.test(password)) return "Add an uppercase letter.";
  if (!/\p{Ll}/u.test(password)) return "Add a lowercase letter.";
  if (!/[^\p{L}\p{N}\s]/u.test(password)) return "Add a special character.";
  return null;
}

const PASSWORD_FIELD: Record<string, string> = {
  "/sign-up/email": "password",
  "/reset-password": "newPassword",
  "/change-password": "newPassword",
};

/** Server check for auth requests. Reads the exact field each endpoint saves, so a decoy field can't pass it. */
export function authRequestProblem(path: string, body: Record<string, unknown> | undefined): string | null {
  const field = PASSWORD_FIELD[path];
  if (!field) return null;
  if (path === "/sign-up/email" && (typeof body?.name !== "string" || !body.name.trim())) return "Enter your name.";
  const password = body?.[field];
  return typeof password === "string" ? passwordProblem(password) : "Enter a password.";
}
