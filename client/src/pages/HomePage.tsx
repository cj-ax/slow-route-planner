import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { PlaceOption, PlaceType, RoutePlan, Waypoint } from "@srp/shared";
import { api } from "../api/client";
import { useRoutePlan } from "../hooks/useRoutePlan";
import { PromptForm } from "../components/PromptForm";
import { RoutePlanPanel } from "../components/RoutePlanPanel";
import { RouteNotes } from "../components/RouteNotes";
import { WaypointEditor } from "../components/WaypointEditor";
import { PlaceOptions } from "../components/PlaceOptions";
import { MapPreview } from "../components/MapPreview";
import { RouteSheet } from "../components/RouteSheet";
import { ErrorPanel } from "../components/ErrorPanel";
import { saveActiveRide } from "../ride/activeRide";
import { shareRoute } from "../lib/shareRoute";

function placeToWaypoint(place: PlaceOption): Waypoint {
  return {
    id: crypto.randomUUID(),
    label: place.name,
    query: place.query || place.address || place.name,
    lat: place.lat,
    lng: place.lng,
    purpose: "destination",
    locked: false,
    reason: place.reason,
  };
}

export function HomePage() {
  const navigate = useNavigate();
  const { plan, loading, error, generate, updatePlan } = useRoutePlan();
  const [selectedWaypointId, setSelectedWaypointId] = useState<string>();
  const [placeOptions, setPlaceOptions] = useState<PlaceOption[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string>();
  const [saveError, setSaveError] = useState<string>();

  async function handleSearchPlaces(type: PlaceType) {
    if (!plan) return;
    setPlacesLoading(true);
    try {
      const near = plan.destination || plan.start;
      const results = await api.searchPlaces({ type, near });
      setPlaceOptions(results);
    } catch {
      setPlaceOptions([]);
    } finally {
      setPlacesLoading(false);
    }
  }

  function handleSelectPlace(place: PlaceOption) {
    updatePlan((current) => {
      const withoutOldDest = current.waypoints.filter((w) => w.purpose !== "destination");
      const destWaypoint = placeToWaypoint(place);
      return {
        ...current,
        destination: place.name,
        waypoints: [...withoutOldDest, destWaypoint],
        foodDrinkOptions: current.foodDrinkOptions.map((o) => ({
          ...o,
          selected: o.id === place.id,
        })),
      };
    });
    setPlaceOptions((opts) => opts.map((o) => ({ ...o, selected: o.id === place.id })));
  }

  async function handleSave() {
    if (!plan) return;
    setSaving(true);
    setSaveError(undefined);
    try {
      const result: RoutePlan = savedId
        ? await api.updateRoute(savedId, { ...plan, id: savedId })
        : await api.saveRoute(plan);
      setSavedId(result.id);
      updatePlan((current) => ({ ...current, id: result.id }));
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const selectedPlaceId = plan?.foodDrinkOptions.find((o) => o.selected)?.id;

  function startRide() {
    if (!plan) return;
    saveActiveRide(plan);
    navigate("/ride");
  }

  // No route yet — show the AI-prompt hero.
  if (!plan) {
    return (
      <div className="page hero-page">
        <PromptForm hero loading={loading} onGenerate={(req) => void generate(req)} />
        {error && <ErrorPanel message={error} />}
      </div>
    );
  }

  // Route exists — full-bleed map with the route sheet over it.
  return (
    <div className="page map-page">
      <div className="map-stage">
        <MapPreview
          plan={plan}
          selectedWaypointId={selectedWaypointId}
          onSelectWaypoint={setSelectedWaypointId}
        />
      </div>

      <RouteSheet
        plan={plan}
        selectedWaypointId={selectedWaypointId}
        onStartRide={startRide}
        onSave={() => void handleSave()}
        saving={saving}
        savedId={savedId}
        onShare={() => void shareRoute(plan)}
      >
        <RoutePlanPanel
          plan={plan}
          onPatch={(partial) => updatePlan((c) => ({ ...c, ...partial }))}
          onSave={() => void handleSave()}
          saving={saving}
          savedId={savedId}
          onSelectWaypoint={setSelectedWaypointId}
        />
        {saveError && <ErrorPanel message={saveError} />}
        <RouteNotes plan={plan} />
        <WaypointEditor
          waypoints={plan.waypoints}
          selectedId={selectedWaypointId}
          onSelectWaypoint={setSelectedWaypointId}
          onChange={(next) => updatePlan((c) => ({ ...c, waypoints: next }))}
        />
        <PlaceOptions
          options={placeOptions.length ? placeOptions : plan.foodDrinkOptions}
          selectedPlaceId={selectedPlaceId}
          loading={placesLoading}
          onSearch={(t) => void handleSearchPlaces(t)}
          onSelect={handleSelectPlace}
        />
      </RouteSheet>
    </div>
  );
}
