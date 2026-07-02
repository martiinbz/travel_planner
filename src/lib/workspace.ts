import type { Trip, TripWorkspace } from "./types";

type CreateTripInput = {
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
};

export function createWorkspaceFromTrip(trip: Trip): TripWorkspace {
  return {
    activeTripId: trip.id,
    trips: [trip],
  };
}

export function normalizeWorkspace(
  value: unknown,
  fallbackTrip: Trip,
): TripWorkspace {
  if (isTripWorkspace(value)) {
    const activeTripExists = value.trips.some((trip) => trip.id === value.activeTripId);
    return {
      activeTripId: activeTripExists ? value.activeTripId : value.trips[0].id,
      trips: value.trips,
    };
  }

  if (isTrip(value)) {
    return createWorkspaceFromTrip(value);
  }

  return createWorkspaceFromTrip(fallbackTrip);
}

export function createTrip(input: CreateTripInput): Trip {
  const startDate = parseDate(input.startDate);
  const endDate = parseDate(input.endDate);
  const normalizedEndDate =
    endDate.getTime() >= startDate.getTime() ? endDate : startDate;
  const city = extractCity(input.destination);
  const id = `trip-${crypto.randomUUID()}`;

  return {
    id,
    title: input.title.trim() || input.destination.trim() || "Nuevo viaje",
    destination: input.destination.trim() || "Destino por decidir",
    startDate: toDateInputValue(startDate),
    endDate: toDateInputValue(normalizedEndDate),
    currency: "EUR",
    days: buildDays(startDate, normalizedEndDate, city),
    places: [],
    reservations: [],
    checklist: defaultChecklist(),
    notes: [],
  };
}

function buildDays(startDate: Date, endDate: Date, city: string): Trip["days"] {
  const days: Trip["days"] = [];
  const cursor = new Date(startDate);
  let dayNumber = 1;

  while (cursor.getTime() <= endDate.getTime()) {
    days.push({
      id: `day-${crypto.randomUUID()}`,
      date: toDateInputValue(cursor),
      title: `Día ${dayNumber}`,
      city,
      notes: "",
      routeStopIds: [],
    });
    cursor.setDate(cursor.getDate() + 1);
    dayNumber += 1;
  }

  return days;
}

function defaultChecklist(): Trip["checklist"] {
  return [
    { id: crypto.randomUUID(), label: "Documentación", done: false, group: "Antes" },
    { id: crypto.randomUUID(), label: "Reservas principales", done: false, group: "Antes" },
    { id: crypto.randomUUID(), label: "Mapas offline", done: false, group: "Viaje" },
  ];
}

function extractCity(destination: string): string {
  return destination.split(",")[0]?.trim() || destination.trim() || "Destino";
}

function parseDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  const date =
    Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
      ? new Date(year, month - 1, day)
      : new Date();
  return Number.isFinite(date.getTime()) ? date : new Date();
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isTripWorkspace(value: unknown): value is TripWorkspace {
  const workspace = value as TripWorkspace;
  return (
    Boolean(workspace) &&
    typeof workspace.activeTripId === "string" &&
    Array.isArray(workspace.trips) &&
    workspace.trips.length > 0 &&
    workspace.trips.every(isTrip)
  );
}

function isTrip(value: unknown): value is Trip {
  const trip = value as Trip;
  return (
    Boolean(trip) &&
    typeof trip.id === "string" &&
    typeof trip.title === "string" &&
    Array.isArray(trip.days) &&
    Array.isArray(trip.places) &&
    Array.isArray(trip.reservations) &&
    Array.isArray(trip.checklist) &&
    Array.isArray(trip.notes)
  );
}
