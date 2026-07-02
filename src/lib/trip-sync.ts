export type TripSyncConfig =
  | { mode: "server"; reason: "configured" }
  | { mode: "local"; reason: "missing-server-credentials" };

export type TripSyncEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export function getTripSyncConfig(env: TripSyncEnv): TripSyncConfig {
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    return { mode: "server", reason: "configured" };
  }

  return { mode: "local", reason: "missing-server-credentials" };
}
