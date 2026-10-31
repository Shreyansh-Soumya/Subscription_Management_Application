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
