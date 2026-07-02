import { describe, expect, it } from "vitest";
import {
  buildGoogleEmbedUrl,
  buildGoogleMapsUrl,
  googlePlaceToPlaceInput,
  googleSearchUrl,
} from "./google-maps";
import type { Place } from "./types";

const places: Place[] = [
  {
    id: "hotel",
    name: "Hotel Artemide",
    category: "hotel",
    status: "booked",
    address: "Via Nazionale 22, Roma",
    lat: 41.9006,
    lng: 12.4937,
    dayId: "day-1",
    notes: "",
    estimatedCost: 0,
    tags: [],
  },
  {
    id: "trevi",
    name: "Fontana di Trevi",
    category: "monument",
    status: "planned",
    address: "Piazza di Trevi, Roma",
    lat: 41.9009,
    lng: 12.4833,
    dayId: "day-1",
    notes: "",
    estimatedCost: 0,
    tags: [],
  },
  {
    id: "trastevere",
    name: "Cena en Trastevere",
    category: "restaurant",
    status: "idea",
    address: "Trastevere, Roma",
    lat: 41.8894,
    lng: 12.4663,
    dayId: "day-1",
    notes: "",
    estimatedCost: 0,
    tags: [],
  },
];

describe("google maps helpers", () => {
  it("builds Google Maps walking directions with waypoints", () => {
    expect(buildGoogleMapsUrl(places)).toBe(
      "https://www.google.com/maps/dir/?api=1&origin=Via%20Nazionale%2022%2C%20Roma&destination=Trastevere%2C%20Roma&travelmode=walking&waypoints=Piazza%20di%20Trevi%2C%20Roma",
    );
  });

  it("builds a directions embed URL when an API key exists", () => {
    expect(buildGoogleEmbedUrl(places, "abc123")).toContain(
      "https://www.google.com/maps/embed/v1/directions?key=abc123",
    );
    expect(buildGoogleEmbedUrl(places, undefined)).toBeNull();
  });

  it("builds a Google search URL for a place", () => {
    expect(googleSearchUrl(places[1])).toBe(
      "https://www.google.com/maps/search/?api=1&query=Fontana%20di%20Trevi%20Piazza%20di%20Trevi%2C%20Roma",
    );
  });

  it("turns a Places API result into a draft place", () => {
    const draft = googlePlaceToPlaceInput(
      {
        place_id: "google-123",
        name: "Roscioli",
        formatted_address: "Via dei Giubbonari, Roma",
        types: ["restaurant", "food"],
        geometry: {
          location: {
            lat: () => 41.8947,
            lng: () => 12.4756,
          },
        },
      },
      "day-1",
    );

    expect(draft).toEqual({
      name: "Roscioli",
      address: "Via dei Giubbonari, Roma",
      category: "restaurant",
      lat: 41.8947,
      lng: 12.4756,
      dayId: "day-1",
      googlePlaceId: "google-123",
      tags: ["google", "restaurant"],
    });
  });

  it("turns a Places API result into a draft without forcing a day", () => {
    const draft = googlePlaceToPlaceInput({
      place_id: "google-456",
      name: "Café Central",
      formatted_address: "Herrengasse 14, Viena",
      types: ["cafe", "food"],
      geometry: {
        location: {
          lat: () => 48.2102,
          lng: () => 16.3653,
        },
      },
    });

    expect(draft?.dayId).toBeUndefined();
    expect(draft?.category).toBe("restaurant");
  });
});
