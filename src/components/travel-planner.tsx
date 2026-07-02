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
  FolderKanban,
  Hotel,
  LayoutDashboard,
  ListChecks,
  MapPin,
  Navigation,
  NotebookPen,
  Plus,
  Plane,
  Route,
  Save,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
  Upload,
  WalletCards,
} from "lucide-react";
import { FormEvent, type RefObject, useEffect, useMemo, useRef, useState } from "react";
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
  TripDay,
  TripWorkspace,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  createTrip,
  createWorkspaceFromTrip,
  normalizeWorkspace,
} from "@/lib/workspace";

const STORAGE_KEY = "travel-planner-trip";
const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
type PlannerTab = "ruta" | "sitios" | "reservas" | "checklist" | "notas";

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
  const [workspace, setWorkspace] = useState<TripWorkspace>(() =>
    createWorkspaceFromTrip(initialTrip),
  );
  const [showDashboard, setShowDashboard] = useState(true);
  const [activeTab, setActiveTab] = useState<PlannerTab>("ruta");
  const [selectedDayId, setSelectedDayId] = useState(initialTrip.days[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<PlaceCategory | "all">("all");
  const [googleDraft, setGoogleDraft] = useState<PlaceDraftFromGoogle | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "local">("idle");
  const hasLoaded = useRef(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let mounted = true;

    async function loadWorkspace() {
      const local = window.localStorage.getItem(STORAGE_KEY);
      if (local) {
        const nextWorkspace = normalizeWorkspace(JSON.parse(local), initialTrip);
        setWorkspace(nextWorkspace);
        setSelectedDayId(getWorkspaceFirstDayId(nextWorkspace));
      }

      const response = await fetch("/api/trip", { credentials: "same-origin" });
      if (response.ok) {
        const payload = (await response.json()) as {
          trip?: Trip | null;
          workspace?: TripWorkspace | null;
        };
        if (mounted && (payload.workspace || payload.trip)) {
          const nextWorkspace = normalizeWorkspace(payload.workspace ?? payload.trip, initialTrip);
          setWorkspace(nextWorkspace);
          setSelectedDayId(getWorkspaceFirstDayId(nextWorkspace));
        }
      }

      hasLoaded.current = true;
    }

    loadWorkspace().catch(() => {
      hasLoaded.current = true;
      setSaveState("local");
    });

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!hasLoaded.current) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    setSaveState("saving");

    const timeout = window.setTimeout(async () => {
      const response = await fetch("/api/trip", {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace }),
      });

      if (!response.ok) {
        setSaveState("local");
        return;
      }

      const payload = (await response.json()) as { mode?: "local" | "server" };
      setSaveState(payload.mode === "server" ? "saved" : "local");
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [workspace]);

  const trip =
    workspace.trips.find((item) => item.id === workspace.activeTripId) ??
    workspace.trips[0] ??
    initialTrip;
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
    setWorkspace((current) => ({
      ...current,
      trips: current.trips.map((item) =>
        item.id === trip.id ? updater(item) : item,
      ),
    }));
  }

  function openTrip(tripId: string) {
    const nextTrip = workspace.trips.find((item) => item.id === tripId);
    if (!nextTrip) {
      return;
    }

    setWorkspace((current) => ({ ...current, activeTripId: tripId }));
    setSelectedDayId(nextTrip.days[0]?.id ?? "");
    setActiveTab("ruta");
    setShowDashboard(false);
  }

  function addTrip(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const newTrip = createTrip({
      title: String(data.get("title") || "").trim(),
      destination: String(data.get("destination") || "").trim(),
      startDate: String(data.get("startDate") || ""),
      endDate: String(data.get("endDate") || ""),
    });

    setWorkspace((current) => ({
      activeTripId: newTrip.id,
      trips: [newTrip, ...current.trips],
    }));
    setSelectedDayId(newTrip.days[0]?.id ?? "");
    setActiveTab("ruta");
    setShowDashboard(false);
    event.currentTarget.reset();
  }

  function addPlace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const dayId = String(data.get("dayId") || "");
    const addToRoute = data.get("addToRoute") === "on" && Boolean(dayId);
    const name = String(data.get("name") || "").trim();
    const address = String(data.get("address") || "").trim();

    if (!name) {
      return;
    }

    const fallbackCoords = getDefaultCoordinates(dayPlaces, trip.places);
    const place: Place = {
      id: crypto.randomUUID(),
      name,
      address: address || selectedDay?.city || trip.destination,
      category: String(data.get("category") || "other") as PlaceCategory,
      status: "idea",
      lat: fallbackCoords.lat,
      lng: fallbackCoords.lng,
      dayId: dayId || undefined,
      notes: String(data.get("notes") || ""),
      estimatedCost: 0,
      tags: [],
    };

    updateTrip((current) => ({
      ...current,
      places: [...current.places, place],
      days: current.days.map((day) =>
        addToRoute && day.id === dayId
          ? { ...day, routeStopIds: [...day.routeStopIds, place.id] }
          : day,
      ),
    }));
    event.currentTarget.reset();
  }

  function saveGooglePlace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!googleDraft) {
      return;
    }

    const data = new FormData(event.currentTarget);
    const dayId = String(data.get("dayId") || "");
    const addToRoute = data.get("addToRoute") === "on" && Boolean(dayId);
    const place: Place = {
      id: crypto.randomUUID(),
      name: googleDraft.name,
      address: googleDraft.address,
      category: String(data.get("category") || googleDraft.category) as PlaceCategory,
      status: "idea",
      lat: googleDraft.lat,
      lng: googleDraft.lng,
      dayId: dayId || undefined,
      googlePlaceId: googleDraft.googlePlaceId,
      notes: String(data.get("notes") || "Añadido desde Google Maps."),
      estimatedCost: 0,
      tags: googleDraft.tags,
    };

    updateTrip((current) => ({
      ...current,
      places: [...current.places, place],
      days: current.days.map((day) =>
        addToRoute && day.id === dayId
          ? { ...day, routeStopIds: [...day.routeStopIds, place.id] }
          : day,
      ),
    }));
    setGoogleDraft(null);
  }

  function addPlaceToDayRoute(placeId: string, dayId: string) {
    updateTrip((current) => ({
      ...current,
      places: current.places.map((place) =>
        place.id === placeId ? { ...place, dayId } : place,
      ),
      days: current.days.map((day) =>
        day.id === dayId && !day.routeStopIds.includes(placeId)
          ? { ...day, routeStopIds: [...day.routeStopIds, placeId] }
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
    const blob = new Blob([JSON.stringify(workspace, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "viajes.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importTrip(file: File | undefined) {
    if (!file) {
      return;
    }
    const text = await file.text();
    const imported = normalizeWorkspace(JSON.parse(text), initialTrip);
    const importedTrip =
      imported.trips.find((item) => item.id === imported.activeTripId) ??
      imported.trips[0];
    setWorkspace(imported);
    setSelectedDayId(importedTrip?.days[0]?.id ?? "");
  }

  if (showDashboard) {
    return (
      <main className="min-h-screen bg-[#eef2ec] text-slate-950">
        <div className="mx-auto flex max-w-[1300px] flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
          <TripsDashboard
            addTrip={addTrip}
            importInputRef={importInputRef}
            importTrip={importTrip}
            onExport={exportTrip}
            onOpenTrip={openTrip}
            saveState={saveState}
            trips={workspace.trips}
          />
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#eef2ec] text-slate-950">
      <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-3 py-3 sm:px-6 lg:px-8">
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
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <button className="button-secondary" onClick={() => setShowDashboard(true)}>
              <LayoutDashboard size={18} />
              Todos los viajes
            </button>
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

        <section className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
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

        <PlannerTabs activeTab={activeTab} setActiveTab={setActiveTab} />

        {activeTab === "sitios" ? (
          <section className="grid gap-4">
            <PlaceForm
              addPlace={addPlace}
              apiKey={GOOGLE_MAPS_API_KEY}
              days={trip.days}
              googleDraft={googleDraft}
              onCancelGoogleDraft={() => setGoogleDraft(null)}
              onSelectGoogleDraft={setGoogleDraft}
              saveGooglePlace={saveGooglePlace}
              selectedDay={selectedDay}
              tripDestination={trip.destination}
            />
            <PlacesByCategoryPanel
              addPlaceToDayRoute={addPlaceToDayRoute}
              categoryFilter={categoryFilter}
              days={trip.days}
              places={visiblePlaces}
              query={query}
              selectedDayId={selectedDay?.id ?? ""}
              setCategoryFilter={setCategoryFilter}
              setQuery={setQuery}
              updatePlaceStatus={updatePlaceStatus}
              removePlace={removePlace}
            />
          </section>
        ) : null}

        {activeTab === "reservas" ? (
          <ReservationsPanel
            addReservation={addReservation}
            days={trip.days}
            reservations={trip.reservations}
            currency={trip.currency}
          />
        ) : null}

        {activeTab === "checklist" ? (
          <ChecklistPanel
            addChecklistItem={addChecklistItem}
            checklist={trip.checklist}
            toggleChecklist={toggleChecklist}
          />
        ) : null}

        {activeTab === "notas" ? <NotesPanel addNote={addNote} notes={trip.notes} /> : null}

        {activeTab === "ruta" ? (
        <section className="grid gap-6">
          <div className="grid gap-6">
            <MapPanel
              apiKey={GOOGLE_MAPS_API_KEY}
              dayPlaces={dayPlaces}
              embedUrl={embedUrl}
              mapsUrl={mapsUrl}
              route={route}
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

        </section>
        ) : null}
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
    <div className="rounded-md border border-white/70 bg-white p-3 shadow-sm sm:p-4">
      <Icon className="text-emerald-700" size={20} />
      <p className="mt-3 text-xs font-semibold text-slate-500 sm:text-sm">{label}</p>
      <p className="mt-1 text-xl font-black sm:text-2xl">{value}</p>
    </div>
  );
}

function TripsDashboard({
  addTrip,
  importInputRef,
  importTrip,
  onExport,
  onOpenTrip,
  saveState,
  trips,
}: {
  addTrip: (event: FormEvent<HTMLFormElement>) => void;
  importInputRef: RefObject<HTMLInputElement | null>;
  importTrip: (file: File | undefined) => void;
  onExport: () => void;
  onOpenTrip: (tripId: string) => void;
  saveState: "idle" | "saving" | "saved" | "local";
  trips: Trip[];
}) {
  return (
    <>
      <header className="grid gap-4 rounded-md border border-white/80 bg-white/90 p-5 shadow-sm lg:grid-cols-[1fr_auto]">
        <div>
          <div className="inline-flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm font-black text-emerald-800">
            <FolderKanban size={18} />
            Dashboard privado
          </div>
          <h1 className="mt-4 text-3xl font-black sm:text-5xl">Nuestros viajes</h1>
          <p className="mt-2 max-w-2xl text-slate-600">
            Un sitio para guardar escapadas, rutas diarias, reservas, sitios pendientes y notas.
          </p>
        </div>
        <div className="flex flex-wrap content-start gap-2">
          <span className="rounded-md bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600">
            {saveState === "saving"
              ? "Guardando..."
              : saveState === "saved"
                ? "Sincronizado"
                : saveState === "local"
                  ? "Guardado local"
                  : "Listo"}
          </span>
          <button className="icon-button" onClick={onExport} title="Exportar viajes">
            <Download size={18} />
          </button>
          <button
            className="icon-button"
            onClick={() => importInputRef.current?.click()}
            title="Importar viajes"
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

      <section className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="grid gap-4 md:grid-cols-2">
          {trips.map((trip) => {
            const stats = calculateTripStats(trip);
            return (
              <article key={trip.id} className="rounded-md border border-white/80 bg-white p-4 shadow-sm">
                <p className="text-sm font-black uppercase text-emerald-700">
                  {trip.destination}
                </p>
                <h2 className="mt-2 text-2xl font-black">{trip.title}</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {formatDate(trip.startDate)} - {formatDate(trip.endDate)}
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2 text-sm">
                  <span className="rounded-md bg-slate-50 p-2 font-bold">
                    {stats.dayCount} días
                  </span>
                  <span className="rounded-md bg-slate-50 p-2 font-bold">
                    {stats.placeCount} sitios
                  </span>
                  <span className="rounded-md bg-slate-50 p-2 font-bold">
                    {stats.bookedReservations} reservas
                  </span>
                </div>
                <button className="button-primary mt-4 w-full justify-center" onClick={() => onOpenTrip(trip.id)}>
                  Abrir viaje
                </button>
              </article>
            );
          })}
        </div>

        <form className="rounded-md border border-emerald-100 bg-[#10251d] p-4 text-white shadow-sm" onSubmit={addTrip}>
          <p className="text-sm font-black uppercase text-emerald-200">Nuevo viaje</p>
          <h2 className="mt-2 text-2xl font-black">Crear escapada</h2>
          <div className="mt-4 grid gap-3">
            <input className="input text-slate-950" name="title" placeholder="Nombre: Viena en Navidad" required />
            <input className="input text-slate-950" name="destination" placeholder="Ciudad o destino" required />
            <div className="grid grid-cols-2 gap-3">
              <input className="input text-slate-950" name="startDate" type="date" required />
              <input className="input text-slate-950" name="endDate" type="date" required />
            </div>
            <button className="button-primary justify-center" type="submit">
              <Plus size={18} />
              Crear viaje
            </button>
          </div>
        </form>
      </section>
    </>
  );
}

function PlannerTabs({
  activeTab,
  setActiveTab,
}: {
  activeTab: PlannerTab;
  setActiveTab: (tab: PlannerTab) => void;
}) {
  const tabs: { id: PlannerTab; label: string; icon: typeof Route }[] = [
    { id: "ruta", label: "Ruta diaria", icon: Route },
    { id: "sitios", label: "Añadir y sitios", icon: MapPin },
    { id: "reservas", label: "Reservas", icon: Plane },
    { id: "checklist", label: "Checklist", icon: ListChecks },
    { id: "notas", label: "Notas", icon: NotebookPen },
  ];

  return (
    <nav className="grid grid-cols-2 gap-2 rounded-md border border-white/80 bg-white p-2 shadow-sm sm:flex sm:overflow-x-auto">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            className={cn(
              "inline-flex min-w-fit items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-black transition",
              activeTab === tab.id
                ? "bg-slate-950 text-white"
                : "text-slate-600 hover:bg-slate-100",
            )}
            onClick={() => setActiveTab(tab.id)}
          >
            <Icon size={17} />
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}

function PlacesByCategoryPanel({
  addPlaceToDayRoute,
  categoryFilter,
  days,
  places,
  query,
  removePlace,
  selectedDayId,
  setCategoryFilter,
  setQuery,
  updatePlaceStatus,
}: {
  addPlaceToDayRoute: (placeId: string, dayId: string) => void;
  categoryFilter: PlaceCategory | "all";
  days: Trip["days"];
  places: Place[];
  query: string;
  removePlace: (placeId: string) => void;
  selectedDayId: string;
  setCategoryFilter: (category: PlaceCategory | "all") => void;
  setQuery: (query: string) => void;
  updatePlaceStatus: (placeId: string, status: PlaceStatus) => void;
}) {
  const selectedDay = days.find((day) => day.id === selectedDayId);
  const grouped = placeCategories
    .map((category) => ({
      ...category,
      places: places.filter((place) => place.category === category.value),
    }))
    .filter((category) => category.places.length);

  return (
    <section className="rounded-md border border-white/70 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-emerald-700">Sitios guardados</p>
          <h2 className="text-2xl font-black">Agrupados por categoría</h2>
        </div>
        <div className="grid w-full gap-2 sm:w-auto sm:grid-cols-[260px_190px]">
          <label className="relative">
            <Search className="absolute left-3 top-3 text-slate-400" size={17} />
            <input
              className="input pl-10"
              placeholder="Filtrar sitios"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <select
            className="input"
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value as PlaceCategory | "all")}
          >
            <option value="all">Todas</option>
            {placeCategories.map((category) => (
              <option key={category.value} value={category.value}>
                {category.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <PlacesOverviewMap places={places} />

      <div className="mt-5 grid gap-4">
        {grouped.length ? (
          grouped.map((group) => (
            <div key={group.value} className="rounded-md border border-slate-200 p-3">
              <div className="mb-3 flex items-center gap-2">
                <span className={cn("h-3 w-3 rounded-full", group.color)} />
                <h3 className="font-black">{group.label}</h3>
                <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-bold text-slate-500">
                  {group.places.length}
                </span>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                {group.places.map((place) => (
                  <article key={place.id} className="rounded-md bg-slate-50 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black">{place.name}</p>
                        <p className="text-sm text-slate-500">{place.address || "Sin dirección"}</p>
                        <p className="mt-1 text-xs font-bold text-slate-400">
                          {place.dayId
                            ? days.find((day) => day.id === place.dayId)?.title ?? "Con día"
                            : "Sin día asignado"}
                        </p>
                      </div>
                      <button className="icon-button-danger" onClick={() => removePlace(place.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {(Object.keys(statusLabels) as PlaceStatus[]).map((status) => (
                        <button
                          key={status}
                          className={cn(
                            "rounded-md border px-2 py-1 text-xs font-bold",
                            place.status === status
                              ? "border-slate-950 bg-slate-950 text-white"
                              : "border-slate-200 bg-white text-slate-600",
                          )}
                          onClick={() => updatePlaceStatus(place.id, status)}
                        >
                          {statusLabels[status]}
                        </button>
                      ))}
                    </div>
                    {selectedDay ? (
                      <button
                        className={cn(
                          "mt-3 w-full rounded-md border px-3 py-2 text-sm font-black transition",
                          place.dayId === selectedDay.id
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-slate-200 bg-white text-slate-700 hover:border-emerald-400",
                        )}
                        onClick={() => addPlaceToDayRoute(place.id, selectedDay.id)}
                      >
                        {place.dayId === selectedDay.id
                          ? `En ruta: ${selectedDay.title}`
                          : `Añadir a ruta: ${selectedDay.title}`}
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 p-8 text-center text-slate-500">
            No hay sitios con esos filtros.
          </div>
        )}
      </div>
    </section>
  );
}

function PlacesOverviewMap({ places }: { places: Place[] }) {
  const mappablePlaces = places.filter(
    (place) =>
      place.address.trim() &&
      Number.isFinite(place.lat) &&
      Number.isFinite(place.lng),
  );
  const mapsUrl = buildGoogleMapsUrl(mappablePlaces);

  return (
    <div className="mt-4 overflow-hidden rounded-md border border-slate-200 bg-slate-50">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 py-2">
        <div>
          <p className="text-xs font-black uppercase text-emerald-700">Mapa de sitios</p>
          <p className="text-sm text-slate-500">
            {mappablePlaces.length
              ? `${mappablePlaces.length} sitios con dirección`
              : "Añade sitios con dirección para verlos aquí"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {mappablePlaces.length ? (
            <a
              className="inline-flex items-center gap-1 rounded-md bg-slate-950 px-2.5 py-1.5 text-xs font-black text-white transition hover:bg-emerald-800"
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink size={14} />
              Abrir en Google Maps
            </a>
          ) : null}
          {placeCategories.map((category) => (
            <span key={category.value} className="inline-flex items-center gap-1 text-xs font-bold text-slate-500">
              <span className={cn("h-2.5 w-2.5 rounded-full", category.color)} />
              {category.label}
            </span>
          ))}
        </div>
      </div>
      <div className="relative min-h-[260px] sm:min-h-[340px]">
        {mappablePlaces.length ? (
          GOOGLE_MAPS_API_KEY ? (
            <GooglePlacesOverviewMap apiKey={GOOGLE_MAPS_API_KEY} places={mappablePlaces} />
          ) : (
            <FallbackPlacesOverviewMap places={mappablePlaces} />
          )
        ) : (
          <div className="grid min-h-[260px] place-items-center p-6 text-center text-sm font-semibold text-slate-500">
            Cuando guardes sitios con dirección, aparecerán marcados por categoría.
          </div>
        )}
      </div>
    </div>
  );
}

function GooglePlacesOverviewMap({
  apiKey,
  places,
}: {
  apiKey: string;
  places: Place[];
}) {
  const mapNodeRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps(apiKey)
      .then(() => {
        if (!cancelled) {
          setIsReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setIsReady(false);
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
      center: { lat: places[0].lat, lng: places[0].lng },
      fullscreenControl: false,
      mapTypeControl: false,
      streetViewControl: false,
      zoom: 13,
    });
  }, [isReady, places]);

  useEffect(() => {
    if (!isReady || !mapRef.current) {
      return;
    }

    markersRef.current.forEach((marker) => marker.setMap(null));
    const bounds = new google.maps.LatLngBounds();

    markersRef.current = places.map((place) => {
      bounds.extend({ lat: place.lat, lng: place.lng });
      const marker = new google.maps.Marker({
        map: mapRef.current,
        position: { lat: place.lat, lng: place.lng },
        title: place.name,
        icon: categoryMarkerIcon(place.category),
      });
      const infoWindow = new google.maps.InfoWindow({
        content: `<a href="${escapeHtml(googleSearchUrl(place))}" target="_blank" rel="noopener noreferrer" style="font-weight:800;color:#047857;text-decoration:none">${escapeHtml(place.name)}</a><br>${escapeHtml(categoryLabel(place.category))}<br>${escapeHtml(place.address)}`,
      });
      marker.addListener("click", () => infoWindow.open({ map: mapRef.current, anchor: marker }));
      return marker;
    });

    if (places.length > 1) {
      mapRef.current.fitBounds(bounds, 48);
    } else {
      mapRef.current.setCenter({ lat: places[0].lat, lng: places[0].lng });
      mapRef.current.setZoom(14);
    }
  }, [isReady, places]);

  return <div ref={mapNodeRef} className="absolute inset-0" />;
}

function FallbackPlacesOverviewMap({ places }: { places: Place[] }) {
  const bounds = getBounds(places);
  const points = places.map((place) => ({
    place,
    position: normalizePosition(place, bounds),
  }));

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="map-grid absolute inset-0" />
      {points.map(({ place, position }) => {
        const category = placeCategories.find((item) => item.value === place.category);
        return (
          <div
            key={place.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${position.x}%`, top: `${position.y}%` }}
            title={place.name}
          >
            <a
              className={cn("grid h-8 w-8 place-items-center rounded-full text-xs font-black text-white ring-4 ring-white", category?.color)}
              href={googleSearchUrl(place)}
              target="_blank"
              rel="noreferrer"
            >
              {categoryLabel(place.category).slice(0, 1)}
            </a>
          </div>
        );
      })}
    </div>
  );
}

function MapPanel({
  apiKey,
  dayPlaces,
  embedUrl,
  mapsUrl,
  route,
  selectedDayTitle,
  visiblePlaces,
}: {
  apiKey?: string;
  dayPlaces: Place[];
  embedUrl: string | null;
  mapsUrl: string;
  route: { distanceKm: number; durationMinutes: number };
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
      <div className="mt-4 grid items-stretch gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="relative min-h-[360px] overflow-hidden rounded-md border border-slate-200 bg-[#dce8dc] sm:min-h-[460px] lg:min-h-[520px]">
          {apiKey ? (
            <GoogleInteractiveMap
              apiKey={apiKey}
              embedUrl={embedUrl}
              places={visiblePlaces}
              routePlaces={dayPlaces}
            />
          ) : (
            <FallbackMap places={visiblePlaces} routePlaces={dayPlaces} />
          )}
        </div>
        <div className="grid max-h-[520px] content-start gap-3 overflow-auto pr-1">
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
  places,
  routePlaces,
}: {
  apiKey: string;
  embedUrl: string | null;
  places: Place[];
  routePlaces: Place[];
}) {
  const mapNodeRef = useRef<HTMLDivElement>(null);
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
          setStatus("Mapa listo. Añade sitios desde Añadir y sitios.");
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
    if (!isReady || !mapRef.current || !directionsRendererRef.current) {
      return;
    }

    markersRef.current.forEach((marker) => marker.setMap(null));
    markersRef.current = places.map((place) => {
      const routeIndex = routePlaces.findIndex((routePlace) => routePlace.id === place.id);
      const marker = new google.maps.Marker({
        map: mapRef.current,
        position: { lat: place.lat, lng: place.lng },
        title: place.name,
        label:
          routeIndex >= 0
            ? {
                text: String(routeIndex + 1),
                color: "#ffffff",
                fontWeight: "900",
              }
            : undefined,
        zIndex: routeIndex >= 0 ? 1000 + routeIndex : undefined,
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
      <div ref={mapNodeRef} className="h-full min-h-[360px] w-full sm:min-h-[460px] lg:min-h-[520px]" />
      <div className="absolute left-3 right-3 top-3 sm:left-4 sm:right-auto sm:max-w-sm">
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
        const routeIndex = routePlaces.findIndex((routePlace) => routePlace.id === place.id);
        return (
          <div
            key={place.id}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: `${position.x}%`, top: `${position.y}%` }}
            title={place.name}
          >
            <div
              className={cn(
                "grid rounded-full text-[11px] font-black text-white ring-4 ring-white",
                routeIndex >= 0 ? "h-7 w-7 place-items-center" : "h-4 w-4",
                category?.color,
              )}
            >
              {routeIndex >= 0 ? routeIndex + 1 : null}
            </div>
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LegacyPlaceForm({
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

function PlaceForm({
  addPlace,
  apiKey,
  days,
  googleDraft,
  onCancelGoogleDraft,
  onSelectGoogleDraft,
  saveGooglePlace,
  selectedDay,
  tripDestination,
}: {
  addPlace: (event: FormEvent<HTMLFormElement>) => void;
  apiKey?: string;
  days: Trip["days"];
  googleDraft: PlaceDraftFromGoogle | null;
  onCancelGoogleDraft: () => void;
  onSelectGoogleDraft: (place: PlaceDraftFromGoogle) => void;
  saveGooglePlace: (event: FormEvent<HTMLFormElement>) => void;
  selectedDay?: TripDay;
  tripDestination: string;
}) {
  return (
    <section className="rounded-md border border-white/70 bg-white p-4 shadow-sm">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
        <div>
          <p className="text-sm font-semibold text-emerald-700">Añadir primero</p>
          <h2 className="text-2xl font-black">Busca en Google o guarda una idea</h2>
          <p className="mt-2 text-sm text-slate-600">
            La búsqueda se orienta a {selectedDay?.city || tripDestination}. Después eliges
            categoría, día y si entra en ruta.
          </p>

          <div className="mt-4 rounded-md border border-emerald-100 bg-emerald-50 p-3">
            <p className="mb-2 text-sm font-black text-emerald-900">Buscar con Google Maps</p>
            <GoogleAutocompleteInput
              apiKey={apiKey}
              locationBias={selectedDay?.city || tripDestination}
              onSelectGoogleDraft={onSelectGoogleDraft}
            />
          </div>

          {googleDraft ? (
            <form className="mt-4 rounded-md border border-slate-200 bg-white p-3" onSubmit={saveGooglePlace}>
              <p className="text-xs font-black uppercase text-emerald-700">Resultado seleccionado</p>
              <h3 className="mt-1 text-xl font-black">{googleDraft.name}</h3>
              <p className="text-sm text-slate-500">{googleDraft.address}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <select className="input" name="category" defaultValue={googleDraft.category}>
                  {placeCategories.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
                <select className="input" name="dayId" defaultValue="">
                  <option value="">Sin día todavía</option>
                  {days.map((day) => (
                    <option key={day.id} value={day.id}>
                      {formatShortDate(day.date)} · {day.title}
                    </option>
                  ))}
                </select>
              </div>
              <label className="mt-3 flex items-center gap-2 rounded-md bg-slate-50 px-3 py-2 text-sm font-bold text-slate-700">
                <input name="addToRoute" type="checkbox" />
                Añadir también a la ruta del día elegido
              </label>
              <textarea className="input mt-3 min-h-20 py-3" name="notes" placeholder="Notas opcionales" />
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <button className="button-primary justify-center" type="submit">
                  Guardar sitio
                </button>
                <button className="button-secondary justify-center" type="button" onClick={onCancelGoogleDraft}>
                  Cancelar
                </button>
              </div>
            </form>
          ) : null}
        </div>

        <form className="rounded-md border border-slate-200 bg-slate-50 p-3" onSubmit={addPlace}>
          <p className="text-sm font-semibold text-emerald-700">Entrada manual</p>
          <h3 className="text-xl font-black">Guardar por nombre</h3>
          <div className="mt-4 grid gap-3">
            <input className="input" name="name" placeholder="Nombre del sitio" required />
            <input className="input" name="address" placeholder="Dirección o zona (opcional)" />
            <select className="input" name="category" defaultValue="other">
              {placeCategories.map((category) => (
                <option key={category.value} value={category.value}>
                  {category.label}
                </option>
              ))}
            </select>
            <select className="input" name="dayId" defaultValue="">
              <option value="">Sin día todavía</option>
              {days.map((day) => (
                <option key={day.id} value={day.id}>
                  {formatShortDate(day.date)} · {day.title}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-bold text-slate-700">
              <input name="addToRoute" type="checkbox" />
              Añadir también a la ruta del día elegido
            </label>
            <textarea className="input min-h-24 py-3" name="notes" placeholder="Notas opcionales" />
            <button className="button-primary justify-center" type="submit">
              <Plus size={18} />
              Añadir sitio
            </button>
          </div>
        </form>
      </div>
    </section>
  );
}

function GoogleAutocompleteInput({
  apiKey,
  locationBias,
  onSelectGoogleDraft,
}: {
  apiKey?: string;
  locationBias: string;
  onSelectGoogleDraft: (place: PlaceDraftFromGoogle) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState(
    apiKey
      ? "Escribe un sitio y elige un resultado."
      : "Añade una API key de Google para activar autocomplete.",
  );

  useEffect(() => {
    if (!apiKey || !inputRef.current) {
      return;
    }

    let listener: google.maps.MapsEventListener | undefined;
    let autocomplete: google.maps.places.Autocomplete | undefined;

    loadGoogleMaps(apiKey)
      .then(() => {
        if (!inputRef.current) {
          return;
        }

        autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
          fields: ["formatted_address", "geometry", "name", "place_id", "types", "vicinity"],
        });

        if (locationBias) {
          const geocoder = new google.maps.Geocoder();
          geocoder.geocode({ address: locationBias }, (results, geocodeStatus) => {
            const location = results?.[0]?.geometry.location;
            if (geocodeStatus === "OK" && location && autocomplete) {
              const bounds = new google.maps.LatLngBounds();
              bounds.extend({ lat: location.lat() - 0.35, lng: location.lng() - 0.35 });
              bounds.extend({ lat: location.lat() + 0.35, lng: location.lng() + 0.35 });
              autocomplete.setBounds(bounds);
              autocomplete.setOptions({ strictBounds: false });
              setStatus(`Buscando cerca de ${locationBias}. Elige un resultado para revisarlo.`);
            }
          });
        }

        listener = autocomplete.addListener("place_changed", () => {
          const place = autocomplete?.getPlace();
          const draft = place ? googlePlaceToPlaceInput(place) : null;

          if (!draft) {
            setStatus("Ese resultado no trae coordenadas. Prueba otro o usa entrada manual.");
            return;
          }

          onSelectGoogleDraft(draft);
          setStatus(`${draft.name} seleccionado. Revisa categoría y día antes de guardar.`);
          if (inputRef.current) {
            inputRef.current.value = "";
          }
        });
      })
      .catch(() => setStatus("No se pudo cargar Google Maps. Revisa la API key."));

    return () => listener?.remove();
  }, [apiKey, locationBias, onSelectGoogleDraft]);

  return (
    <div className="grid gap-2">
      <label className="relative">
        <Search className="absolute left-3 top-3 text-slate-400" size={17} />
        <input
          ref={inputRef}
          className="input bg-white pl-10"
          disabled={!apiKey}
          placeholder={`Buscar cerca de ${locationBias || "la ciudad"}`}
          type="search"
        />
      </label>
      <p className="text-xs font-bold text-emerald-900">{status}</p>
    </div>
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

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function LegacyNotesPanel({
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

function NotesPanel({
  addNote,
  notes,
}: {
  addNote: (event: FormEvent<HTMLFormElement>) => void;
  notes: string[];
}) {
  const noteStyles = [
    "bg-amber-50 border-amber-200",
    "bg-emerald-50 border-emerald-200",
    "bg-sky-50 border-sky-200",
    "bg-rose-50 border-rose-200",
  ];

  return (
    <section className="rounded-md border border-white/70 bg-white p-4 shadow-sm">
      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <form className="rounded-md bg-slate-950 p-4 text-white" onSubmit={addNote}>
          <StickyNote size={22} />
          <h2 className="mt-3 text-2xl font-black">Notas del viaje</h2>
          <p className="mt-1 text-sm text-slate-300">
            Ideas sueltas, dudas, planes B o restaurantes que mirar luego.
          </p>
          <textarea
            className="input mt-4 min-h-28 py-3 text-slate-950"
            name="note"
            placeholder="Idea, duda o recordatorio"
          />
          <button className="button-primary mt-3 w-full justify-center" type="submit">
            <Plus size={18} />
            Añadir nota
          </button>
        </form>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {notes.map((note, index) => (
            <article
              key={`${note}-${index}`}
              className={cn(
                "min-h-32 rounded-md border p-4 shadow-sm",
                noteStyles[index % noteStyles.length],
              )}
            >
              <p className="text-xs font-black uppercase text-slate-500">Nota {index + 1}</p>
              <p className="mt-3 text-sm leading-6 text-slate-800">{note}</p>
            </article>
          ))}
          {!notes.length ? (
            <div className="rounded-md border border-dashed border-slate-300 p-8 text-center text-slate-500">
              Todavía no hay notas.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
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

function categoryMarkerIcon(category: PlaceCategory): google.maps.Icon {
  const fill = categoryColor(category);
  const svg = encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
      <circle cx="18" cy="18" r="14" fill="${fill}" stroke="white" stroke-width="4"/>
      <text x="18" y="23" text-anchor="middle" font-family="Arial" font-size="13" font-weight="900" fill="white">${categoryLabel(category).slice(0, 1)}</text>
    </svg>`,
  );

  return {
    url: `data:image/svg+xml;charset=UTF-8,${svg}`,
    scaledSize: new google.maps.Size(36, 36),
    anchor: new google.maps.Point(18, 18),
  };
}

function categoryColor(category: PlaceCategory): string {
  const colors: Record<PlaceCategory, string> = {
    restaurant: "#f43f5e",
    monument: "#f59e0b",
    hotel: "#0ea5e9",
    transport: "#334155",
    shopping: "#d946ef",
    nature: "#10b981",
    other: "#6366f1",
  };

  return colors[category];
}

function getWorkspaceFirstDayId(workspace: TripWorkspace): string {
  const activeTrip =
    workspace.trips.find((trip) => trip.id === workspace.activeTripId) ??
    workspace.trips[0];
  return activeTrip?.days[0]?.id ?? "";
}

function getDefaultCoordinates(dayPlaces: Place[], tripPlaces: Place[]) {
  const candidates = dayPlaces.length ? dayPlaces : tripPlaces;
  if (!candidates.length) {
    return { lat: 41.9028, lng: 12.4964 };
  }

  return {
    lat: candidates.reduce((total, place) => total + place.lat, 0) / candidates.length,
    lng: candidates.reduce((total, place) => total + place.lng, 0) / candidates.length,
  };
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
