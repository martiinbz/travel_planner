"use client";

import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Download,
  ExternalLink,
  FileText,
  Hotel,
  MapPin,
  Navigation,
  Plus,
  Plane,
  Route,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  WalletCards,
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { logoutAction } from "@/app/actions";
import {
  buildGoogleEmbedUrl,
  buildGoogleMapsUrl,
  googlePlaceToPlaceInput,
  googleSearchUrl,
  type PlaceDraftFromGoogle,
} from "@/lib/google-maps";
import { initialTrip } from "@/lib/sample-data";
import {
  calculateTripStats,
  estimateRoute,
  sortRouteStops,
} from "@/lib/travel-utils";
import type {
  Place,
  PlaceCategory,
  PlaceStatus,
  ReservationStatus,
  ReservationType,
  Trip,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "travel-planner-trip";
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

let googleMapsLoader: Promise<typeof google> | null = null;

const placeCategories: { value: PlaceCategory; label: string; color: string }[] = [
  { value: "restaurant", label: "Restaurante", color: "bg-rose-500" },
  { value: "monument", label: "Monumento", color: "bg-amber-500" },
  { value: "hotel", label: "Hotel", color: "bg-sky-500" },
  { value: "transport", label: "Transporte", color: "bg-slate-700" },
  { value: "shopping", label: "Compras", color: "bg-fuchsia-500" },
  { value: "nature", label: "Naturaleza", color: "bg-emerald-500" },
  { value: "other", label: "Otro", color: "bg-indigo-500" },
];

const statusLabels: Record<PlaceStatus, string> = {
  idea: "Idea",
  planned: "Planificado",
  booked: "Reservado",
  visited: "Visitado",
};

const reservationTypes: { value: ReservationType; label: string }[] = [
  { value: "flight", label: "Vuelo" },
  { value: "hotel", label: "Hotel" },
  { value: "train", label: "Tren" },
  { value: "car", label: "Coche" },
  { value: "restaurant", label: "Restaurante" },
  { value: "ticket", label: "Entrada" },
  { value: "other", label: "Otro" },
];

const reservationStatuses: { value: ReservationStatus; label: string }[] = [
  { value: "pending", label: "Pendiente" },
  { value: "confirmed", label: "Confirmada" },
  { value: "cancelled", label: "Cancelada" },
];

export function TravelPlanner() {
  const [trip, setTrip] = useState<Trip>(initialTrip);
  const [selectedDayId, setSelectedDayId] = useState(initialTrip.days[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<PlaceCategory | "all">("all");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "local">("idle");
  const [isPending, startTransition] = useTransition();
  const hasLoaded = useRef(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;

    async function loadTrip() {
      const local = window.localStorage.getItem(STORAGE_KEY);
      if (local) {
        setTrip(JSON.parse(local) as Trip);
      }

      const response = await fetch("/api/trip", { credentials: "same-origin" });
      if (response.ok) {
        const payload = (await response.json()) as { trip?: Trip | null };
        if (mounted && payload.trip) {
          setTrip(payload.trip);
        }
      }

      hasLoaded.current = true;
    }

    loadTrip();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(trip));
    setSaveState("saving");

    const timeout = window.setTimeout(async () => {
      const response = await fetch("/api/trip", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip }),
      });

      if (!response.ok) {
        setSaveState("local");
        return;
      }

      const payload = (await response.json()) as { mode?: "local" | "server" };
      setSaveState(payload.mode === "server" ? "saved" : "local");
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [trip]);

  const selectedDay = trip.days.find((day) => day.id === selectedDayId) ?? trip.days[0];
  const dayPlaces = useMemo(
    () =>
      selectedDay
        ? sortRouteStops(
            selectedDay,
            trip.places.filter((place) => place.dayId === selectedDay.id),
          )
        : [],
    [selectedDay, trip.places],
  );
  const route = estimateRoute(dayPlaces);
  const stats = calculateTripStats(trip);
  const visiblePlaces = trip.places.filter((place) => {
    const matchesQuery = `${place.name} ${place.address} ${place.tags.join(" ")}`
      .toLowerCase()
      .includes(query.toLowerCase());
    const matchesCategory = categoryFilter === "all" || place.category === categoryFilter;
    return matchesQuery && matchesCategory;
  });

  const mapsUrl = useMemo(() => buildGoogleMapsUrl(dayPlaces), [dayPlaces]);
  const embedUrl = useMemo(
    () => buildGoogleEmbedUrl(dayPlaces, GOOGLE_MAPS_API_KEY),
    [dayPlaces],
  );

  function updateTrip(updater: (draft: Trip) => Trip) {
    setTrip((current) => updater(current));
  }

  function addPlace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const dayId = String(data.get("dayId") || selectedDay?.id || "");
    const name = String(data.get("name") || "").trim();
    const address = String(data.get("address") || "").trim();

    if (!name || !address) {
      return;
    }

    const place: Place = {
      id: crypto.randomUUID(),
      name,
      address,
      category: String(data.get("category")) as PlaceCategory,
      status: "idea",
      lat: Number(data.get("lat") || 41.9028),
      lng: Number(data.get("lng") || 12.4964),
      dayId,
      notes: String(data.get("notes") || ""),
      estimatedCost: Number(data.get("estimatedCost") || 0),
      tags: String(data.get("tags") || "")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    };

    updateTrip((current) => ({
      ...current,
      places: [...current.places, place],
      days: current.days.map((day) =>
        day.id === dayId
          ? { ...day, routeStopIds: [...day.routeStopIds, place.id] }
          : day,
      ),
    }));
    event.currentTarget.reset();
  }

  function addGooglePlace(draft: PlaceDraftFromGoogle) {
    const place: Place = {
      id: crypto.randomUUID(),
      name: draft.name,
      address: draft.address,
      category: draft.category,
      status: "idea",
      lat: draft.lat,
      lng: draft.lng,
      dayId: draft.dayId,
      googlePlaceId: draft.googlePlaceId,
      notes: "Añadido desde Google Maps.",
      estimatedCost: 0,
      tags: draft.tags,
    };

    updateTrip((current) => ({
      ...current,
      places: [...current.places, place],
      days: current.days.map((day) =>
        day.id === draft.dayId
          ? { ...day, routeStopIds: [...day.routeStopIds, place.id] }
          : day,
      ),
    }));
  }

  function addReservation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const title = String(data.get("title") || "").trim();

    if (!title) {
      return;
    }

    updateTrip((current) => ({
      ...current,
      reservations: [
        ...current.reservations,
        {
          id: crypto.randomUUID(),
          type: String(data.get("type")) as ReservationType,
          title,
          provider: String(data.get("provider") || ""),
          date: String(data.get("date") || current.startDate),
          time: String(data.get("time") || ""),
          locator: String(data.get("locator") || ""),
          amount: Number(data.get("amount") || 0),
          status: String(data.get("status")) as ReservationStatus,
          notes: String(data.get("notes") || ""),
          dayId: String(data.get("dayId") || "") || undefined,
          attachmentName:
            (data.get("attachment") as File | null)?.name || undefined,
        },
      ],
    }));
    event.currentTarget.reset();
  }

  function moveRouteStop(placeId: string, direction: -1 | 1) {
    if (!selectedDay) {
      return;
    }

    updateTrip((current) => ({
      ...current,
      days: current.days.map((day) => {
        if (day.id !== selectedDay.id) {
          return day;
        }

        const routeStopIds = [...day.routeStopIds];
        const index = routeStopIds.indexOf(placeId);
        const target = index + direction;
        if (index < 0 || target < 0 || target >= routeStopIds.length) {
          return day;
        }
        [routeStopIds[index], routeStopIds[target]] = [
          routeStopIds[target],
          routeStopIds[index],
        ];
        return { ...day, routeStopIds };
      }),
    }));
  }

  function updatePlaceStatus(placeId: string, status: PlaceStatus) {
    updateTrip((current) => ({
      ...current,
      places: current.places.map((place) =>
        place.id === placeId ? { ...place, status } : place,
      ),
    }));
  }

  function removePlace(placeId: string) {
    updateTrip((current) => ({
      ...current,
      places: current.places.filter((place) => place.id !== placeId),
      days: current.days.map((day) => ({
        ...day,
        routeStopIds: day.routeStopIds.filter((id) => id !== placeId),
      })),
    }));
  }

  function toggleChecklist(itemId: string) {
    updateTrip((current) => ({
      ...current,
      checklist: current.checklist.map((item) =>
        item.id === itemId ? { ...item, done: !item.done } : item,
      ),
    }));
  }

  function addChecklistItem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const label = String(data.get("label") || "").trim();
    if (!label) {
      return;
    }
    updateTrip((current) => ({
      ...current,
      checklist: [
        ...current.checklist,
        {
          id: crypto.randomUUID(),
          label,
          done: false,
          group: String(data.get("group") || "General"),
        },
      ],
    }));
    event.currentTarget.reset();
  }

  function addNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const note = String(data.get("note") || "").trim();
    if (!note) {
      return;
    }
    updateTrip((current) => ({ ...current, notes: [note, ...current.notes] }));
    event.currentTarget.reset();
  }

  function exportTrip() {
    const blob = new Blob([JSON.stringify(trip, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${trip.title.toLowerCase().replace(/\s+/g, "-")}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importTrip(file: File | undefined) {
    if (!file) {
      return;
    }
    const text = await file.text();
    setTrip(JSON.parse(text) as Trip);
  }

  return (
    <main className="min-h-screen bg-[#eef2ec] text-slate-950">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
        <header className="grid gap-4 rounded-md border border-white/80 bg-white/85 p-4 shadow-sm backdrop-blur lg:grid-cols-[1fr_auto]">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-sm font-semibold text-emerald-800">
              <Sparkles size={17} />
              Plan privado
              <span className="rounded-md bg-emerald-50 px-2 py-1">
                {saveState === "saving"
                  ? "Guardando..."
                  : saveState === "saved"
                    ? "Sincronizado"
                    : saveState === "local"
                      ? "Guardado local"
                      : "Listo"}
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">
              {trip.title}
            </h1>
            <p className="mt-1 text-slate-600">
              {trip.destination} · {formatDate(trip.startDate)} -{" "}
              {formatDate(trip.endDate)}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button className="icon-button" onClick={exportTrip} title="Exportar JSON">
              <Download size={18} />
            </button>
            <button
              className="icon-button"
              onClick={() => importInputRef.current?.click()}
              title="Importar JSON"
            >
              <Upload size={18} />
            </button>
            <input
              ref={importInputRef}
              className="hidden"
              type="file"
              accept="application/json"
              onChange={(event) => importTrip(event.target.files?.[0])}
            />
            <form action={logoutAction}>
              <button className="button-secondary" type="submit">
                Salir
              </button>
            </form>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Stat icon={CalendarDays} label="Días" value={stats.dayCount} />
          <Stat icon={MapPin} label="Sitios" value={stats.placeCount} />
          <Stat icon={Save} label="Reservas" value={stats.bookedReservations} />
          <Stat
            icon={CheckCircle2}
            label="Checklist"
            value={`${stats.checklistProgress}%`}
          />
          <Stat
            icon={WalletCards}
            label="Estimado"
            value={formatMoney(stats.estimatedBudget, trip.currency)}
          />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(390px,0.65fr)]">
          <div className="grid gap-6">
            <MapPanel
              apiKey={GOOGLE_MAPS_API_KEY}
              dayPlaces={dayPlaces}
              embedUrl={embedUrl}
              mapsUrl={mapsUrl}
              onAddGooglePlace={addGooglePlace}
              route={route}
              selectedDayId={selectedDay?.id ?? ""}
              selectedDayTitle={selectedDay?.title ?? "Sin día"}
              visiblePlaces={visiblePlaces}
            />
            <PlannerPanel
              days={trip.days}
              places={dayPlaces}
              selectedDayId={selectedDay?.id ?? ""}
              setSelectedDayId={setSelectedDayId}
              moveRouteStop={moveRouteStop}
              updatePlaceStatus={updatePlaceStatus}
              removePlace={removePlace}
            />
          </div>

          <aside className="grid gap-6">
            <PlaceForm
              addPlace={addPlace}
              categoryFilter={categoryFilter}
              days={trip.days}
              query={query}
              selectedDayId={selectedDay?.id ?? ""}
              setCategoryFilter={setCategoryFilter}
              setQuery={setQuery}
            />
            <ReservationsPanel
              addReservation={addReservation}
              days={trip.days}
              reservations={trip.reservations}
              currency={trip.currency}
            />
            <ChecklistPanel
              addChecklistItem={addChecklistItem}
              checklist={trip.checklist}
              toggleChecklist={toggleChecklist}
            />
            <NotesPanel addNote={addNote} notes={trip.notes} />
            <SetupPanel isPending={isPending} startTransition={startTransition} />
          </aside>
        </section>
      </div>
    </main>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CalendarDays;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-md border border-white/70 bg-white p-4 shadow-sm">
      <Icon className="text-emerald-700" size={20} />
      <p className="mt-4 text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
    </div>
  );
}

function MapPanel({
  apiKey,
  dayPlaces,
  embedUrl,
  mapsUrl,
  onAddGooglePlace,
  route,
  selectedDayId,
  selectedDayTitle,
  visiblePlaces,
}: {
  apiKey?: string;
  dayPlaces: Place[];
  embedUrl: string | null;
  mapsUrl: string;
  onAddGooglePlace: (place: PlaceDraftFromGoogle) => void;
  route: { distanceKm: number; durationMinutes: number };
  selectedDayId: string;
  selectedDayTitle: string;
  visiblePlaces: Place[];
}) {
  return (
    <section className="rounded-md border border-white/70 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-700">Mapa y ruta diaria</p>
          <h2 className="text-2xl font-black">{selectedDayTitle}</h2>
        </div>
        <a className="button-primary" href={mapsUrl} target="_blank" rel="noreferrer">
          <Navigation size={18} />
          Google Maps
        </a>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-[1fr_270px]">
        <div className="relative min-h-[430px] overflow-hidden rounded-md border border-slate-200 bg-[#dce8dc]">
          {apiKey ? (
            <GoogleInteractiveMap
              apiKey={apiKey}
              embedUrl={embedUrl}
              onAddGooglePlace={onAddGooglePlace}
              places={visiblePlaces}
              routePlaces={dayPlaces}
              selectedDayId={selectedDayId}
            />
          ) : (
            <FallbackMap places={visiblePlaces} routePlaces={dayPlaces} />
          )}
        </div>
        <div className="grid content-start gap-3">
          <div className="rounded-md bg-slate-950 p-4 text-white">
            <Route size={22} />
            <p className="mt-3 text-sm text-slate-300">Estimación a pie</p>
            <p className="text-2xl font-black">
              {route.distanceKm} km · {route.durationMinutes} min
            </p>
          </div>
          {dayPlaces.map((place, index) => (
            <a
              key={place.id}
              className="rounded-md border border-slate-200 p-3 transition hover:border-emerald-400 hover:bg-emerald-50"
              href={googleSearchUrl(place)}
              target="_blank"
              rel="noreferrer"
            >
              <p className="text-xs font-black text-emerald-700">Parada {index + 1}</p>
              <p className="font-bold">{place.name}</p>
              <p className="line-clamp-1 text-sm text-slate-500">{place.address}</p>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

function GoogleInteractiveMap({
  apiKey,
  embedUrl,
  onAddGooglePlace,
  places,
  routePlaces,
  selectedDayId,
}: {
  apiKey: string;
  embedUrl: string | null;
  onAddGooglePlace: (place: PlaceDraftFromGoogle) => void;
  places: Place[];
  routePlaces: Place[];
  selectedDayId: string;
}) {
  const mapNodeRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const [status, setStatus] = useState("Cargando Google Maps...");
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    loadGoogleMaps(apiKey)
      .then(() => {
        if (!cancelled) {
          setIsReady(true);
          setStatus("Busca en Google y añade sitios al día seleccionado.");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("No se pudo cargar Google Maps. Usa el enlace externo.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey]);

  useEffect(() => {
    if (!isReady || !mapNodeRef.current || mapRef.current) {
      return;
    }

    mapRef.current = new google.maps.Map(mapNodeRef.current, {
      center: routePlaces[0] ? { lat: routePlaces[0].lat, lng: routePlaces[0].lng } : { lat: 41.9028, lng: 12.4964 },
      mapTypeControl: false,
      fullscreenControl: false,
      streetViewControl: false,
      zoom: 13,
    });
    directionsRendererRef.current = new google.maps.DirectionsRenderer({
      map: mapRef.current,
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: "#047857",
        strokeWeight: 5,
      },
    });
  }, [isReady, routePlaces]);

  useEffect(() => {
    if (!isReady || !mapRef.current || !inputRef.current) {
      return;
    }

    const searchBox = new google.maps.places.SearchBox(inputRef.current);
    const listener = searchBox.addListener("places_changed", () => {
      const place = searchBox.getPlaces()?.[0];
      const draft = place ? googlePlaceToPlaceInput(place, selectedDayId) : null;

      if (!draft) {
        setStatus("El resultado no trae coordenadas suficientes.");
        return;
      }

      onAddGooglePlace(draft);
      setStatus(`${draft.name} añadido a la ruta.`);
      inputRef.current!.value = "";
    });

    return () => listener.remove();
  }, [isReady, onAddGooglePlace, selectedDayId]);

  useEffect(() => {
    if (!isReady || !mapRef.current || !directionsRendererRef.current) {
      return;
    }

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = places.map((place) => {
      const marker = new google.maps.Marker({
        map: mapRef.current,
        position: { lat: place.lat, lng: place.lng },
        title: place.name,
        label: routePlaces.some((routePlace) => routePlace.id === place.id)
          ? String(routePlaces.findIndex((routePlace) => routePlace.id === place.id) + 1)
          : undefined,
      });

      const infoWindow = new google.maps.InfoWindow({
        content: `<strong>${escapeHtml(place.name)}</strong><br>${escapeHtml(place.address)}`,
      });
      marker.addListener("click", () => infoWindow.open({ map: mapRef.current, anchor: marker }));
      return marker;
    });

    if (!routePlaces.length) {
      directionsRendererRef.current.setDirections(null);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    routePlaces.forEach((place) => bounds.extend({ lat: place.lat, lng: place.lng }));
    mapRef.current.fitBounds(bounds);

    if (routePlaces.length < 2) {
      directionsRendererRef.current.setDirections(null);
      return;
    }

    const service = new google.maps.DirectionsService();
    service.route(
      {
        origin: { lat: routePlaces[0].lat, lng: routePlaces[0].lng },
        destination: {
          lat: routePlaces[routePlaces.length - 1].lat,
          lng: routePlaces[routePlaces.length - 1].lng,
        },
        travelMode: google.maps.TravelMode.WALKING,
        waypoints: routePlaces.slice(1, -1).map((place) => ({
          location: { lat: place.lat, lng: place.lng },
          stopover: true,
        })),
      },
      (result, responseStatus) => {
        if (responseStatus === google.maps.DirectionsStatus.OK && result) {
          directionsRendererRef.current?.setDirections(result);
          setStatus("Ruta diaria calculada en Google Maps.");
          return;
        }

        setStatus("Google no pudo calcular la ruta; puedes abrirla fuera.");
      },
    );
  }, [isReady, places, routePlaces]);

  return (
    <div className="absolute inset-0">
      <div ref={mapNodeRef} className="h-full min-h-[430px] w-full" />
      <div className="absolute left-3 right-3 top-3 grid gap-2 sm:left-4 sm:right-auto sm:w-[390px]">
        <label className="relative block">
          <Search className="absolute left-3 top-3 text-slate-400" size={17} />
          <input
            ref={inputRef}
            className="input bg-white/95 pl-10 shadow-lg"
            placeholder="Buscar en Google Maps y añadir"
            type="search"
          />
        </label>
        <p className="rounded-md bg-white/95 px-3 py-2 text-xs font-semibold text-slate-600 shadow">
          {status}
        </p>
      </div>
      {embedUrl ? (
        <a
          className="absolute bottom-3 left-3 rounded-md bg-white/95 px-3 py-2 text-xs font-black text-emerald-800 shadow"
          href={embedUrl}
          target="_blank"
          rel="noreferrer"
        >
          Ver embed de Google
        </a>
      ) : null}
    </div>
  );
}

function FallbackMap({
  places,
  routePlaces,
}: {
  places: Place[];
  routePlaces: Place[];
}) {
  const bounds = getBounds(places);
  const points = places.map((place) => ({
    place,
    position: normalizePosition(place, bounds),
  }));
  const routePoints = routePlaces.map((place) => normalizePosition(place, bounds));

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="map-grid absolute inset-0" />
      <svg className="absolute inset-0 h-full w-full" role="img" aria-label="Ruta dibujada">
        {routePoints.length > 1 ? (
          <polyline
            fill="none"
            points={routePoints.map((p) => `${p.x},${p.y}`).join(" ")}
            stroke="#047857"
            strokeDasharray="8 8"
            strokeLinecap="round"
            strokeWidth="4"
          />
        ) : null}
      </svg>
      {points.map(({ place, position }) => {
        const category = placeCategories.find((item) => item.value === place.category);
        return (
          <div
            key={place.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${position.x}%`, top: `${position.y}%` }}
            title={place.name}
          >
            <div className={cn("h-4 w-4 rounded-full ring-4 ring-white", category?.color)} />
          </div>
        );
      })}
      <div className="absolute bottom-4 left-4 max-w-sm rounded-md bg-white/90 p-3 text-sm text-slate-600 shadow-sm">
        Añade `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` para ver el mapa real de Google
        dentro de la app.
      </div>
    </div>
  );
}

function PlannerPanel({
  days,
  places,
  selectedDayId,
  setSelectedDayId,
  moveRouteStop,
  updatePlaceStatus,
  removePlace,
}: {
  days: Trip["days"];
  places: Place[];
  selectedDayId: string;
  setSelectedDayId: (id: string) => void;
  moveRouteStop: (placeId: string, direction: -1 | 1) => void;
  updatePlaceStatus: (placeId: string, status: PlaceStatus) => void;
  removePlace: (placeId: string) => void;
}) {
  return (
    <section className="rounded-md border border-white/70 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap gap-2">
        {days.map((day) => (
          <button
            key={day.id}
            className={cn(
              "rounded-md border px-3 py-2 text-left text-sm font-bold transition",
              day.id === selectedDayId
                ? "border-emerald-700 bg-emerald-700 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-emerald-400",
            )}
            onClick={() => setSelectedDayId(day.id)}
          >
            {formatShortDate(day.date)} · {day.title}
          </button>
        ))}
      </div>
      <div className="mt-5 grid gap-3">
        {places.length ? (
          places.map((place, index) => (
            <article key={place.id} className="rounded-md border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-emerald-700">
                    {index + 1}. {categoryLabel(place.category)}
                  </p>
                  <h3 className="mt-1 text-xl font-black">{place.name}</h3>
                  <p className="text-sm text-slate-500">{place.address}</p>
                </div>
                <div className="flex gap-1">
                  <button className="icon-button" onClick={() => moveRouteStop(place.id, -1)}>
                    <ChevronUp size={17} />
                  </button>
                  <button className="icon-button" onClick={() => moveRouteStop(place.id, 1)}>
                    <ChevronDown size={17} />
                  </button>
                  <button className="icon-button-danger" onClick={() => removePlace(place.id)}>
                    <Trash2 size={17} />
                  </button>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {(Object.keys(statusLabels) as PlaceStatus[]).map((status) => (
                  <button
                    key={status}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs font-bold",
                      place.status === status
                        ? "border-slate-950 bg-slate-950 text-white"
                        : "border-slate-200 text-slate-600",
                    )}
                    onClick={() => updatePlaceStatus(place.id, status)}
                  >
                    {statusLabels[status]}
                  </button>
                ))}
              </div>
              {place.notes ? <p className="mt-3 text-sm text-slate-600">{place.notes}</p> : null}
            </article>
          ))
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 p-8 text-center text-slate-500">
            Este día todavía no tiene paradas.
          </div>
        )}
      </div>
    </section>
  );
}

function PlaceForm({
  addPlace,
  categoryFilter,
  days,
  query,
  selectedDayId,
  setCategoryFilter,
  setQuery,
}: {
  addPlace: (event: FormEvent<HTMLFormElement>) => void;
  categoryFilter: PlaceCategory | "all";
  days: Trip["days"];
  query: string;
  selectedDayId: string;
  setCategoryFilter: (category: PlaceCategory | "all") => void;
  setQuery: (query: string) => void;
}) {
  return (
    <section className="rounded-md border border-white/70 bg-white p-4 shadow-sm">
      <h2 className="text-xl font-black">Añadir sitio</h2>
      <div className="mt-4 grid gap-3">
        <label className="relative">
          <Search className="absolute left-3 top-3 text-slate-400" size={17} />
          <input
            className="input pl-10"
            placeholder="Filtrar por nombre, dirección o etiqueta"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <select
          className="input"
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value as PlaceCategory | "all")}
        >
          <option value="all">Todas las categorías</option>
          {placeCategories.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
      </div>
      <form className="mt-4 grid gap-3" onSubmit={addPlace}>
        <input className="input" name="name" placeholder="Nombre del sitio" required />
        <input className="input" name="address" placeholder="Dirección o zona" required />
        <div className="grid grid-cols-2 gap-3">
          <select className="input" name="category" defaultValue="monument">
            {placeCategories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
          <select className="input" name="dayId" defaultValue={selectedDayId}>
            {days.map((day) => (
              <option key={day.id} value={day.id}>
                {formatShortDate(day.date)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <input className="input" name="lat" placeholder="Lat" type="number" step="0.0001" />
          <input className="input" name="lng" placeholder="Lng" type="number" step="0.0001" />
          <input className="input" name="estimatedCost" placeholder="€" type="number" />
        </div>
        <input className="input" name="tags" placeholder="Etiquetas: cena, vistas..." />
        <textarea className="input min-h-20 py-3" name="notes" placeholder="Notas" />
        <div className="grid gap-2 sm:grid-cols-2">
          <button className="button-primary" type="submit">
            <Plus size={18} />
            Añadir
          </button>
          <a
            className="button-secondary justify-center"
            href="https://www.google.com/maps/search/?api=1"
            target="_blank"
            rel="noreferrer"
          >
            <ExternalLink size={18} />
            Buscar en Maps
          </a>
        </div>
      </form>
    </section>
  );
}

function ReservationsPanel({
  addReservation,
  currency,
  days,
  reservations,
}: {
  addReservation: (event: FormEvent<HTMLFormElement>) => void;
  currency: Trip["currency"];
  days: Trip["days"];
  reservations: Trip["reservations"];
}) {
  return (
    <section className="rounded-md border border-white/70 bg-white p-4 shadow-sm">
      <h2 className="text-xl font-black">Reservas</h2>
      <div className="mt-4 grid gap-3">
        {reservations.map((reservation) => (
          <article key={reservation.id} className="rounded-md border border-slate-200 p-3">
            <div className="flex items-start gap-3">
              {reservation.type === "flight" ? <Plane size={19} /> : <Hotel size={19} />}
              <div>
                <p className="font-black">{reservation.title}</p>
                <p className="text-sm text-slate-500">
                  {reservation.provider} · {formatDate(reservation.date)} {reservation.time}
                </p>
                <p className="mt-1 text-sm">
                  {reservation.locator || "Sin localizador"} ·{" "}
                  {formatMoney(reservation.amount, currency)}
                </p>
                {reservation.attachmentName ? (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-emerald-700">
                    <FileText size={14} />
                    {reservation.attachmentName}
                  </p>
                ) : null}
              </div>
            </div>
          </article>
        ))}
      </div>
      <form className="mt-4 grid gap-3" onSubmit={addReservation}>
        <input className="input" name="title" placeholder="Título de la reserva" required />
        <div className="grid grid-cols-2 gap-3">
          <select className="input" name="type">
            {reservationTypes.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </select>
          <select className="input" name="status" defaultValue="confirmed">
            {reservationStatuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>
        <input className="input" name="provider" placeholder="Proveedor" />
        <div className="grid grid-cols-3 gap-3">
          <input className="input" name="date" type="date" />
          <input className="input" name="time" type="time" />
          <input className="input" name="amount" placeholder="€" type="number" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input className="input" name="locator" placeholder="Localizador" />
          <select className="input" name="dayId" defaultValue="">
            <option value="">Sin día</option>
            {days.map((day) => (
              <option key={day.id} value={day.id}>
                {formatShortDate(day.date)}
              </option>
            ))}
          </select>
        </div>
        <input className="input" name="attachment" type="file" />
        <textarea className="input min-h-20 py-3" name="notes" placeholder="Notas" />
        <button className="button-primary" type="submit">
          <Plus size={18} />
          Guardar reserva
        </button>
      </form>
    </section>
  );
}

function ChecklistPanel({
  addChecklistItem,
  checklist,
  toggleChecklist,
}: {
  addChecklistItem: (event: FormEvent<HTMLFormElement>) => void;
  checklist: Trip["checklist"];
  toggleChecklist: (itemId: string) => void;
}) {
  return (
    <section className="rounded-md border border-white/70 bg-white p-4 shadow-sm">
      <h2 className="text-xl font-black">Checklist</h2>
      <div className="mt-4 grid gap-2">
        {checklist.map((item) => (
          <button
            key={item.id}
            className="flex items-center gap-3 rounded-md border border-slate-200 p-3 text-left transition hover:bg-slate-50"
            onClick={() => toggleChecklist(item.id)}
          >
            {item.done ? (
              <CheckCircle2 className="text-emerald-700" size={20} />
            ) : (
              <Circle className="text-slate-400" size={20} />
            )}
            <span className={cn("font-semibold", item.done && "text-slate-400 line-through")}>
              {item.label}
            </span>
            <span className="ml-auto rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">
              {item.group}
            </span>
          </button>
        ))}
      </div>
      <form className="mt-4 grid grid-cols-[1fr_120px_auto] gap-2" onSubmit={addChecklistItem}>
        <input className="input" name="label" placeholder="Nuevo item" required />
        <input className="input" name="group" placeholder="Grupo" />
        <button className="icon-button" type="submit">
          <Plus size={18} />
        </button>
      </form>
    </section>
  );
}

function NotesPanel({
  addNote,
  notes,
}: {
  addNote: (event: FormEvent<HTMLFormElement>) => void;
  notes: string[];
}) {
  return (
    <section className="rounded-md border border-white/70 bg-white p-4 shadow-sm">
      <h2 className="text-xl font-black">Notas rápidas</h2>
      <form className="mt-4 grid gap-2" onSubmit={addNote}>
        <textarea className="input min-h-20 py-3" name="note" placeholder="Idea, duda o recordatorio" />
        <button className="button-primary" type="submit">
          <Plus size={18} />
          Añadir nota
        </button>
      </form>
      <div className="mt-4 grid gap-2">
        {notes.map((note, index) => (
          <p key={`${note}-${index}`} className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
            {note}
          </p>
        ))}
      </div>
    </section>
  );
}

function SetupPanel({
  isPending,
  startTransition,
}: {
  isPending: boolean;
  startTransition: (callback: () => void) => void;
}) {
  return (
    <section className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
      <p className="font-black">Listo para Vercel</p>
      <p className="mt-2 leading-6">
        Configura `TRAVEL_PLANNER_PASSWORD`, `TRAVEL_PLANNER_AUTH_SECRET`,
        `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` y, si queréis sincronización real,
        `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
      </p>
      <button
        className="mt-3 inline-flex items-center gap-2 font-black text-emerald-800"
        onClick={() => startTransition(() => window.scrollTo({ top: 0, behavior: "smooth" }))}
      >
        {isPending ? "Preparando..." : "Volver arriba"}
      </button>
    </section>
  );
}

function loadGoogleMaps(apiKey: string): Promise<typeof google> {
  if (window.google?.maps?.places) {
    return Promise.resolve(window.google);
  }

  if (googleMapsLoader) {
    return googleMapsLoader;
  }

  googleMapsLoader = new Promise((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-google-maps="travel-planner"]',
    );

    if (existingScript) {
      existingScript.addEventListener("load", () => resolve(window.google), { once: true });
      existingScript.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.async = true;
    script.defer = true;
    script.dataset.googleMaps = "travel-planner";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(
      apiKey,
    )}&libraries=places`;
    script.addEventListener("load", () => resolve(window.google), { once: true });
    script.addEventListener("error", reject, { once: true });
    document.head.appendChild(script);
  });

  return googleMapsLoader;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function categoryLabel(category: PlaceCategory): string {
  return placeCategories.find((item) => item.value === category)?.label ?? "Otro";
}

function getBounds(places: Place[]) {
  const latitudes = places.map((place) => place.lat);
  const longitudes = places.map((place) => place.lng);
  return {
    minLat: Math.min(...latitudes, 41.86),
    maxLat: Math.max(...latitudes, 41.93),
    minLng: Math.min(...longitudes, 12.43),
    maxLng: Math.max(...longitudes, 12.51),
  };
}

function normalizePosition(place: Place, bounds: ReturnType<typeof getBounds>) {
  const lngRange = bounds.maxLng - bounds.minLng || 1;
  const latRange = bounds.maxLat - bounds.minLat || 1;

  return {
    x: 10 + ((place.lng - bounds.minLng) / lngRange) * 80,
    y: 90 - ((place.lat - bounds.minLat) / latRange) * 80,
  };
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("es", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("es", {
    day: "2-digit",
    month: "short",
  }).format(new Date(`${value}T00:00:00`));
}

function formatMoney(value: number, currency: Trip["currency"]): string {
  return new Intl.NumberFormat("es", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}
