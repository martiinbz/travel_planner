import { NextRequest, NextResponse } from "next/server";
import {
  AUTH_COOKIE_NAME,
  getConfiguredPassword,
  getSessionSecret,
  isValidSessionToken,
} from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase";
import { getTripSyncConfig } from "@/lib/trip-sync";
import { initialTrip } from "@/lib/sample-data";
import type { Trip, TripWorkspace } from "@/lib/types";
import { normalizeWorkspace } from "@/lib/workspace";

const TRIP_ROW_ID = "main";

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const syncConfig = getTripSyncConfig({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (syncConfig.mode === "local") {
    return NextResponse.json({ mode: "local", workspace: null });
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase!
    .from("travel_plans")
    .select("data")
    .eq("id", TRIP_ROW_ID)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    mode: "server",
    workspace: data?.data ? normalizeWorkspace(data.data, initialTrip) : null,
  });
}

export async function PUT(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as {
    trip?: Trip;
    workspace?: TripWorkspace;
  };
  const workspace = body.workspace ?? (body.trip ? normalizeWorkspace(body.trip, initialTrip) : null);
  if (!workspace?.trips.length) {
    return NextResponse.json({ error: "Invalid workspace payload" }, { status: 400 });
  }

  const syncConfig = getTripSyncConfig({
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  });
  if (syncConfig.mode === "local") {
    return NextResponse.json({ mode: "local" });
  }

  const supabase = createServerSupabaseClient();
  const { error } = await supabase!.from("travel_plans").upsert({
    id: TRIP_ROW_ID,
    data: workspace,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ mode: "server" });
}

function isAuthorized(request: NextRequest): boolean {
  return isValidSessionToken(
    request.cookies.get(AUTH_COOKIE_NAME)?.value,
    getConfiguredPassword(),
    getSessionSecret(),
  );
}
