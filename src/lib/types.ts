export type PlaceCategory =
  | "restaurant"
  | "monument"
  | "hotel"
  | "transport"
  | "shopping"
  | "nature"
  | "other";

export type PlaceStatus = "idea" | "planned" | "booked" | "visited";

export type ReservationType =
  | "flight"
  | "hotel"
  | "train"
  | "car"
  | "restaurant"
  | "ticket"
  | "other";

export type ReservationStatus = "pending" | "confirmed" | "cancelled";

export type TripDay = {
  id: string;
  date: string;
  title: string;
  city: string;
  notes: string;
  routeStopIds: string[];
};

export type Place = {
  id: string;
  name: string;
  category: PlaceCategory;
  status: PlaceStatus;
  address: string;
  lat: number;
  lng: number;
  dayId?: string;
  googlePlaceId?: string;
  notes: string;
  estimatedCost: number;
  tags: string[];
};

export type Reservation = {
  id: string;
  type: ReservationType;
  title: string;
  provider: string;
  date: string;
  time: string;
  locator: string;
  amount: number;
  status: ReservationStatus;
  notes: string;
  dayId?: string;
  attachmentName?: string;
};

export type ChecklistItem = {
  id: string;
  label: string;
  done: boolean;
  group: string;
};

export type Trip = {
  id: string;
  title: string;
  destination: string;
  startDate: string;
  endDate: string;
  currency: "EUR" | "USD" | "GBP";
  days: TripDay[];
  places: Place[];
  reservations: Reservation[];
  checklist: ChecklistItem[];
  notes: string[];
};

export type TripWorkspace = {
  activeTripId: string;
  trips: Trip[];
};

export type TripStats = {
  dayCount: number;
  placeCount: number;
  bookedReservations: number;
  checklistProgress: number;
  estimatedBudget: number;
};

export type RouteEstimate = {
  distanceKm: number;
  durationMinutes: number;
};
