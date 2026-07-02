import { describe, expect, it } from "vitest";
import {
  createTrip,
  createWorkspaceFromTrip,
  normalizeWorkspace,
} from "./workspace";
import type { Trip, TripWorkspace } from "./types";

const trip: Trip = {
  id: "trip-roma",
  title: "Roma juntos",
  destination: "Roma, Italia",
  startDate: "2026-09-10",
  endDate: "2026-09-12",
  currency: "EUR",
  days: [],
  places: [],
  reservations: [],
  checklist: [],
  notes: [],
};

describe("workspace helpers", () => {
  it("migrates an old single-trip payload into a workspace", () => {
    const workspace = normalizeWorkspace(trip, trip);

    expect(workspace).toEqual({
      activeTripId: "trip-roma",
      trips: [trip],
    });
  });

  it("keeps a valid multi-trip workspace and repairs a missing active trip", () => {
    const workspace: TripWorkspace = {
      activeTripId: "deleted-trip",
      trips: [
        trip,
        { ...trip, id: "trip-viena", title: "Viena", destination: "Viena, Austria" },
      ],
    };

    expect(normalizeWorkspace(workspace, trip).activeTripId).toBe("trip-roma");
    expect(normalizeWorkspace(workspace, trip).trips).toHaveLength(2);
  });

  it("creates a new trip with one independent itinerary day per date", () => {
    const created = createTrip({
      title: "Navidad en Viena",
      destination: "Viena, Austria",
      startDate: "2026-12-24",
      endDate: "2026-12-26",
    });

    expect(created.title).toBe("Navidad en Viena");
    expect(created.destination).toBe("Viena, Austria");
    expect(created.days.map((day) => day.date)).toEqual([
      "2026-12-24",
      "2026-12-25",
      "2026-12-26",
    ]);
    expect(created.days.every((day) => day.city === "Viena")).toBe(true);
    expect(created.places).toEqual([]);
  });

  it("wraps a trip in a workspace with that trip selected", () => {
    expect(createWorkspaceFromTrip(trip)).toEqual({
      activeTripId: "trip-roma",
      trips: [trip],
    });
  });
});
