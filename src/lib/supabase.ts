import { createClient } from "@supabase/supabase-js";
import type { Trip } from "./types";

export type TravelPlanRow = {
  id: string;
  data: Trip;
  updated_at?: string;
};

export function createServerSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    return null;
  }

  return createClient(url, key);
}
