import { describe, expect, it } from "vitest";
import { PASSWORD_RULES, passwordProblem } from "./password";

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
