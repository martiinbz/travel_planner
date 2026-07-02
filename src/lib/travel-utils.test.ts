import { describe, expect, it } from "vitest";
import {
  calculateTripStats,
  estimateRoute,
  sortRouteStops,
} from "./travel-utils";
import type { Trip, TripDay } from "./types";

const days: TripDay[] = [
  {
    id: "day-1",
    date: "2026-09-10",
    title: "Llegada",
    city: "Roma",
    notes: "",
    routeStopIds: ["colosseum", "trastevere"],
  },
  {
    id: "day-2",
    date: "2026-09-11",
    title: "Centro",
    city: "Roma",
    notes: "",
    routeStopIds: ["pantheon"],
  },
];

const trip: Trip = {
  id: "trip-1",
  title: "Roma juntos",
  destination: "Roma",
  startDate: "2026-09-10",
  endDate: "2026-09-12",
  currency: "EUR",
  days,
  places: [
    {
      id: "colosseum",
      name: "Coliseo",
      category: "monument",
      status: "planned",
      address: "Piazza del Colosseo",
      lat: 41.8902,
      lng: 12.4922,
      dayId: "day-1",
      notes: "",
      estimatedCost: 18,
      tags: ["historia"],
    },
    {
      id: "trastevere",
      name: "Cena en Trastevere",
      category: "restaurant",
      status: "idea",
      address: "Trastevere",
      lat: 41.8894,
      lng: 12.4663,
      dayId: "day-1",
      notes: "",
      estimatedCost: 55,
      tags: ["comida"],
    },
    {
      id: "pantheon",
      name: "Panteon",
      category: "monument",
      status: "booked",
      address: "Piazza della Rotonda",
      lat: 41.8986,
      lng: 12.4769,
      dayId: "day-2",
      notes: "",
      estimatedCost: 5,
      tags: ["historia"],
    },
  ],
  reservations: [
    {
      id: "flight-1",
      type: "flight",
      title: "Vuelo Madrid - Roma",
      provider: "ITA Airways",
      date: "2026-09-10",
      time: "08:30",
      locator: "ABC123",
      amount: 240,
      status: "confirmed",
      notes: "",
    },
  ],
  checklist: [
    { id: "passport", label: "DNI", done: true, group: "Documentos" },
    { id: "adapter", label: "Adaptador", done: false, group: "Maleta" },
  ],
  notes: ["Reservar mesa con terraza"],
};

describe("travel-utils", () => {
  it("calculates the main dashboard stats for a trip", () => {
    expect(calculateTripStats(trip)).toEqual({
      dayCount: 3,
      placeCount: 3,
      bookedReservations: 1,
      checklistProgress: 50,
      estimatedBudget: 318,
    });
  });

  it("sorts route stops by the day route order and leaves unknown stops last", () => {
    const sorted = sortRouteStops(days[0], trip.places);

    expect(sorted.map((place) => place.id)).toEqual([
      "colosseum",
      "trastevere",
      "pantheon",
    ]);
  });

  it("estimates route distance and duration from coordinates", () => {
    const route = estimateRoute([trip.places[0], trip.places[1]]);

    expect(route.distanceKm).toBeGreaterThan(2);
    expect(route.distanceKm).toBeLessThan(4);
    expect(route.durationMinutes).toBeGreaterThan(30);
  });
});
