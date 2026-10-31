import { describe, expect, it } from "vitest";
import { authRequestProblem, PASSWORD_RULES, passwordProblem } from "./password";

describe("passwordProblem", () => {
  it("accepts a password that meets every rule", () => {
    expect(passwordProblem("Abcdefg1!")).toBeNull();
    expect(passwordProblem("Abcdefgh@")).toBeNull();
  });

  it("requires more than eight characters", () => {
    expect(passwordProblem("Abcdefg!")).toBe("Use more than 8 characters.");
  });

  it("requires an uppercase letter", () => {
    expect(passwordProblem("abcdefgh!")).toBe("Add an uppercase letter.");
  });

  it("requires a lowercase letter", () => {
    expect(passwordProblem("ABCDEFGH!")).toBe("Add a lowercase letter.");
  });

  it("requires a special character", () => {
    expect(passwordProblem("Abcdefgh1")).toBe("Add a special character.");
  });

  it("doesn't count a space as the special character", () => {
    expect(passwordProblem("Abcdefgh ")).toBe("Add a special character.");
  });

  it("refuses an extremely long password", () => {
    expect(passwordProblem(`A!a${"x".repeat(200)}`)).toBe("Use 128 characters or fewer.");
  });

  it("has a sentence to show on forms", () => {
    expect(PASSWORD_RULES).toContain("more than 8 characters");
  });
});

describe("authRequestProblem", () => {
  const good = "Abcdefg1!";

  it("checks the new password on reset and change, ignoring a strong decoy", () => {
    for (const path of ["/reset-password", "/change-password"]) {
      expect(authRequestProblem(path, { password: good, newPassword: "aaaaaaaaa" })).toBe("Add an uppercase letter.");
      expect(authRequestProblem(path, { newPassword: good })).toBeNull();
    }
  });

  it("checks the password on signup, ignoring a strong decoy", () => {
    expect(authRequestProblem("/sign-up/email", { name: "A", newPassword: good, password: "aaaaaaaaa" })).toBe("Add an uppercase letter.");
    expect(authRequestProblem("/sign-up/email", { name: "A", password: good })).toBeNull();
  });

  it("refuses a missing or non-text password", () => {
    expect(authRequestProblem("/reset-password", {})).toBe("Enter a password.");
    expect(authRequestProblem("/sign-up/email", { name: "A", password: 123456789 })).toBe("Enter a password.");
    expect(authRequestProblem("/sign-up/email", undefined)).toBe("Enter your name.");
  });

  it("refuses a blank name on signup", () => {
    expect(authRequestProblem("/sign-up/email", { name: "   ", password: good })).toBe("Enter your name.");
  });

  it("leaves other requests alone", () => {
    expect(authRequestProblem("/sign-in/email", { password: "x" })).toBeNull();
  });
});
