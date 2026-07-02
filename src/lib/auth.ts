import { createHash, timingSafeEqual } from "node:crypto";

export const AUTH_COOKIE_NAME = "travel_planner_session";
export const DEFAULT_LOCAL_PASSWORD = "viaje2026";

export function getConfiguredPassword(): string {
  return process.env.TRAVEL_PLANNER_PASSWORD || DEFAULT_LOCAL_PASSWORD;
}

export function getSessionSecret(): string {
  return process.env.TRAVEL_PLANNER_AUTH_SECRET || getConfiguredPassword();
}

export function createSessionToken(password: string, secret: string): string {
  return createHash("sha256")
    .update(`${secret}:${password}`)
    .digest("hex");
}

export function isValidSessionToken(
  token: string | undefined,
  password: string,
  secret: string,
): boolean {
  if (!token) {
    return false;
  }

  const expected = createSessionToken(password, secret);

  try {
    return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
  } catch {
    return false;
  }
}
