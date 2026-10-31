import { describe, expect, it } from "vitest";
import { emailUnavailable } from "./email";

describe("emailUnavailable", () => {
  it("is true in production without SMTP settings", () => {
    expect(emailUnavailable({ NODE_ENV: "production" })).toBe(true);
    expect(emailUnavailable({ NODE_ENV: "production", SMTP_USER: "a", SMTP_PASS: "" })).toBe(true);
  });

  it("is false in production with SMTP settings", () => {
    expect(emailUnavailable({ NODE_ENV: "production", SMTP_USER: "a", SMTP_PASS: "b" })).toBe(false);
  });

  it("is false in local development, which prints the email instead", () => {
    expect(emailUnavailable({ NODE_ENV: "development" })).toBe(false);
  });
});
