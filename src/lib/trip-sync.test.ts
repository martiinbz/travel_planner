import { describe, expect, it } from "vitest";
import { getTripSyncConfig } from "./trip-sync";

describe("trip sync config", () => {
  it("uses local-only mode when Supabase server credentials are missing", () => {
    expect(getTripSyncConfig({})).toEqual({
      mode: "local",
      reason: "missing-server-credentials",
    });
  });

  it("uses server mode only with private Supabase credentials", () => {
    expect(
      getTripSyncConfig({
        SUPABASE_URL: "https://example.supabase.co",
        SUPABASE_SERVICE_ROLE_KEY: "service-role-key",
      }),
    ).toEqual({
      mode: "server",
      reason: "configured",
    });
  });
});
