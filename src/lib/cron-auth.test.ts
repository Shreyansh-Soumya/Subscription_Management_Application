import { describe, expect, it } from "vitest";
import { isAuthorizedCron } from "./cron-auth";

describe("isAuthorizedCron", () => {
  it("accepts the right secret", () => {
    expect(isAuthorizedCron("Bearer s3cret", "s3cret")).toBe(true);
  });

  it("rejects a wrong secret, including one of a different length", () => {
    expect(isAuthorizedCron("Bearer wrong!", "s3cret")).toBe(false);
    expect(isAuthorizedCron("Bearer s", "s3cret")).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(isAuthorizedCron(null, "s3cret")).toBe(false);
  });

  it("rejects everyone when no secret is configured", () => {
    expect(isAuthorizedCron("Bearer ", "")).toBe(false);
    expect(isAuthorizedCron("Bearer undefined", undefined)).toBe(false);
  });
});
