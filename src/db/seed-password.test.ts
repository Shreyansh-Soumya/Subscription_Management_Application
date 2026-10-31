import { describe, expect, it } from "vitest";
import { seedPassword } from "./seed-password";

const local = "postgres://brightloop:brightloop@127.0.0.1:55440/brightloop";
const hosted = "postgres://user:secret@ep-example.ap-southeast-1.aws.neon.tech/neondb";

describe("seedPassword", () => {
  it("uses the documented demo password on a local database", () => {
    expect(seedPassword(local, undefined)).toBe("Brightloop@123");
    expect(seedPassword("postgres://a:b@localhost:5432/c", undefined)).toBe("Brightloop@123");
  });

  it("refuses a hosted database without a private password", () => {
    expect(() => seedPassword(hosted, undefined)).toThrow("SEED_PASSWORD");
  });

  it("refuses the public demo password on a hosted database", () => {
    expect(() => seedPassword(hosted, "Brightloop@123")).toThrow("SEED_PASSWORD");
  });

  it("uses a private password when one is given", () => {
    expect(seedPassword(hosted, "A-private-Passw0rd!")).toBe("A-private-Passw0rd!");
    expect(seedPassword(local, "A-private-Passw0rd!")).toBe("A-private-Passw0rd!");
  });

  it("isn't fooled by a hosted address that merely contains localhost", () => {
    expect(() => seedPassword("postgres://a:b@localhost.evil.example/c", undefined)).toThrow("SEED_PASSWORD");
  });
});
