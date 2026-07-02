import { describe, expect, it } from "vitest";
import { createSessionToken, isValidSessionToken } from "./auth";

describe("auth", () => {
  it("accepts only the token derived from the configured password and secret", () => {
    const token = createSessionToken("vamos-a-roma", "secret-local");

    expect(isValidSessionToken(token, "vamos-a-roma", "secret-local")).toBe(
      true,
    );
    expect(isValidSessionToken(token, "otra-password", "secret-local")).toBe(
      false,
    );
    expect(isValidSessionToken("tampered", "vamos-a-roma", "secret-local")).toBe(
      false,
    );
  });
});
