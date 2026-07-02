import type { Place, RouteEstimate, Trip, TripDay, TripStats } from "./types";

const EARTH_RADIUS_KM = 6371;
const WALKING_SPEED_KM_H = 4.5;
const MINUTES_PER_STOP_TRANSFER = 5;

export function calculateTripStats(trip: Trip): TripStats {
  const start = new Date(`${trip.startDate}T00:00:00`);
  const end = new Date(`${trip.endDate}T00:00:00`);
  const dayCount =
    Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
      ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1)
      : trip.days.length;
  const doneChecklist = trip.checklist.filter((item) => item.done).length;
  const checklistProgress = trip.checklist.length
    ? Math.round((doneChecklist / trip.checklist.length) * 100)
    : 0;

  return {
    dayCount,
    placeCount: trip.places.length,
    bookedReservations: trip.reservations.filter(
      (reservation) => reservation.status === "confirmed",
    ).length,
    checklistProgress,
    estimatedBudget:
      sumAmounts(trip.places.map((place) => place.estimatedCost)) +
      sumAmounts(trip.reservations.map((reservation) => reservation.amount)),
  };
}

export function sortRouteStops(day: TripDay, places: Place[]): Place[] {
  const order = new Map(day.routeStopIds.map((id, index) => [id, index]));

  return [...places].sort((a, b) => {
    const aOrder = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;

    if (aOrder !== bOrder) {
      return aOrder - bOrder;
    }

    return a.name.localeCompare(b.name, "es");
  });
}

export function estimateRoute(places: Pick<Place, "lat" | "lng">[]): RouteEstimate {
  const distanceKm = places.reduce((total, place, index) => {
    const next = places[index + 1];
    return next ? total + distanceBetween(place, next) : total;
  }, 0);

  return {
    distanceKm: round(distanceKm, 1),
    durationMinutes: Math.max(
      places.length > 1 ? 1 : 0,
      Math.round((distanceKm / WALKING_SPEED_KM_H) * 60) +
        Math.max(0, places.length - 1) * MINUTES_PER_STOP_TRANSFER,
    ),
  };
}

export function distanceBetween(
  a: Pick<Place, "lat" | "lng">,
  b: Pick<Place, "lat" | "lng">,
): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const haversine =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
}

function sumAmounts(amounts: number[]): number {
  return amounts.reduce((total, amount) => total + (Number.isFinite(amount) ? amount : 0), 0);
}

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

function round(value: number, precision: number): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}
