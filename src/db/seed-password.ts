const DEMO_PASSWORD = "Brightloop@123";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "postgres"]); // "postgres" is the Docker Compose service

export function isLocalDatabase(databaseUrl: string): boolean {
  return LOCAL_HOSTS.has(new URL(databaseUrl).hostname);
}

/** The public demo password is for local databases only, because it's published in the README. */
export function seedPassword(databaseUrl: string, privatePassword: string | undefined): string {
  if (isLocalDatabase(databaseUrl)) return privatePassword || DEMO_PASSWORD;
  if (!privatePassword || privatePassword === DEMO_PASSWORD) {
    throw new Error("This isn't a local database. Set SEED_PASSWORD to a private password before seeding it.");
  }
  return privatePassword;
}
