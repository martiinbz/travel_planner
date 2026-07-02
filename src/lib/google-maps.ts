import type { Place, PlaceCategory } from "./types";

type GoogleLatLngLike = {
  lat: () => number;
  lng: () => number;
};

export type GooglePlaceLike = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  vicinity?: string;
  types?: string[];
  geometry?: {
    location?: GoogleLatLngLike;
  };
};

export type PlaceDraftFromGoogle = {
  name: string;
  address: string;
  category: PlaceCategory;
  lat: number;
  lng: number;
  dayId: string;
  googlePlaceId?: string;
  tags: string[];
};

export function buildGoogleMapsUrl(places: Pick<Place, "address" | "name">[]): string {
  if (!places.length) {
    return "https://www.google.com/maps";
  }

  if (places.length === 1) {
    return googleSearchUrl(places[0]);
  }

  const origin = encodeURIComponent(places[0].address || places[0].name);
  const destinationPlace = places[places.length - 1];
  const destination = encodeURIComponent(
    destinationPlace.address || destinationPlace.name,
  );
  const waypoints = places
    .slice(1, -1)
    .map((place) => encodeURIComponent(place.address || place.name))
    .join("|");

  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=walking${
    waypoints ? `&waypoints=${waypoints}` : ""
  }`;
}

export function buildGoogleEmbedUrl(
  places: Pick<Place, "address" | "name">[],
  apiKey: string | undefined,
): string | null {
  if (!apiKey || !places.length) {
    return null;
  }

  if (places.length === 1) {
    return `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${encodeURIComponent(
      places[0].address || places[0].name,
    )}`;
  }

  const origin = encodeURIComponent(places[0].address || places[0].name);
  const destinationPlace = places[places.length - 1];
  const destination = encodeURIComponent(
    destinationPlace.address || destinationPlace.name,
  );
  const waypoints = places
    .slice(1, -1)
    .map((place) => encodeURIComponent(place.address || place.name))
    .join("|");

  return `https://www.google.com/maps/embed/v1/directions?key=${apiKey}&origin=${origin}&destination=${destination}&mode=walking${
    waypoints ? `&waypoints=${waypoints}` : ""
  }`;
}

export function googleSearchUrl(place: Pick<Place, "address" | "name">): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    `${place.name} ${place.address}`,
  )}`;
}

export function googlePlaceToPlaceInput(
  place: GooglePlaceLike,
  dayId: string,
): PlaceDraftFromGoogle | null {
  const location = place.geometry?.location;
  const name = place.name?.trim();

  if (!location || !name) {
    return null;
  }

  const category = categoryFromGoogleTypes(place.types ?? []);
  const primaryType = (place.types ?? []).find(Boolean);

  return {
    name,
    address: place.formatted_address || place.vicinity || name,
    category,
    lat: location.lat(),
    lng: location.lng(),
    dayId,
    googlePlaceId: place.place_id,
    tags: ["google", primaryType].filter(Boolean) as string[],
  };
}

export function categoryFromGoogleTypes(types: string[]): PlaceCategory {
  if (types.some((type) => ["restaurant", "cafe", "bar", "bakery"].includes(type))) {
    return "restaurant";
  }

  if (types.some((type) => ["lodging"].includes(type))) {
    return "hotel";
  }

  if (
    types.some((type) =>
      ["airport", "train_station", "subway_station", "bus_station", "transit_station"].includes(
        type,
      ),
    )
  ) {
    return "transport";
  }

  if (types.some((type) => ["shopping_mall", "store"].includes(type))) {
    return "shopping";
  }

  if (types.some((type) => ["park", "natural_feature"].includes(type))) {
    return "nature";
  }

  if (
    types.some((type) =>
      ["tourist_attraction", "museum", "church", "place_of_worship"].includes(type),
    )
  ) {
    return "monument";
  }

  return "other";
}
