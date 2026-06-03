import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { PlaceOption, PlaceType, Waypoint } from "@srp/shared";
import { api } from "../api/client";
import { useRoutePlan } from "../hooks/useRoutePlan";
import { MapPreview } from "../components/MapPreview";
import { RouteSheet } from "../components/RouteSheet";
import { RouteTools } from "../components/RouteTools";
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

export function RouteDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { plan, setPlan, updatePlan } = useRoutePlan();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string>();
  const [selectedWaypointId, setSelectedWaypointId] = useState<string>();
  const [placeOptions, setPlaceOptions] = useState<PlaceOption[]>([]);
  const [placesLoading, setPlacesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string>();

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .getRoute(id)
      .then(setPlan)
      .catch((err) => setLoadError((err as Error).message))
      .finally(() => setLoading(false));
  }, [id, setPlan]);

  async function handleSearchPlaces(type: PlaceType) {
    if (!plan) return;
    setPlacesLoading(true);
    try {
      const near = plan.destination || plan.start;
      setPlaceOptions(await api.searchPlaces({ type, near }));
    } catch {
      setPlaceOptions([]);
    } finally {
      setPlacesLoading(false);
    }
  }

  function handleSelectPlace(place: PlaceOption) {
    updatePlan((current) => {
      const withoutOldDest = current.waypoints.filter((w) => w.purpose !== "destination");
      return {
        ...current,
        destination: place.name,
        waypoints: [...withoutOldDest, placeToWaypoint(place)],
        foodDrinkOptions: current.foodDrinkOptions.map((o) => ({
          ...o,
          selected: o.id === place.id,
        })),
      };
    });
    setPlaceOptions((opts) => opts.map((o) => ({ ...o, selected: o.id === place.id })));
  }

  async function handleSave() {
    if (!plan || !id) return;
    setSaving(true);
    setSaved(false);
    setSaveError(undefined);
    try {
      const result = await api.updateRoute(id, { ...plan, id });
      setPlan(result);
      setSaved(true);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="muted page">Loading route…</p>;
  if (loadError) {
    return (
      <div className="page">
        <ErrorPanel message={loadError} />
        <Link to="/routes" className="btn btn--ghost">
          ← Back to saved routes
        </Link>
      </div>
    );
  }
  if (!plan) return null;

  const selectedPlaceId = plan.foodDrinkOptions.find((o) => o.selected)?.id;

  function startRide() {
    if (!plan) return;
    saveActiveRide(plan);
    navigate(id ? `/routes/${id}/ride` : "/ride");
  }

  return (
    <div className="page map-page">
      <div className="map-stage">
        <MapPreview
          plan={plan}
          selectedWaypointId={selectedWaypointId}
          onSelectWaypoint={setSelectedWaypointId}
        />
      </div>

      <Link to="/routes" className="floating-chip">
        ← Saved
      </Link>

      {saveError && (
        <div className="map-error">
          <ErrorPanel message={saveError} />
        </div>
      )}

      <RouteTools
        plan={plan}
        selectedWaypointId={selectedWaypointId}
        onSelectWaypoint={setSelectedWaypointId}
        onChangeWaypoints={(next) => updatePlan((c) => ({ ...c, waypoints: next }))}
        placeOptions={placeOptions}
        placesLoading={placesLoading}
        selectedPlaceId={selectedPlaceId}
        onSearchPlaces={(t) => void handleSearchPlaces(t)}
        onSelectPlace={handleSelectPlace}
      />

      <RouteSheet
        plan={plan}
        selectedWaypointId={selectedWaypointId}
        onSelectWaypoint={setSelectedWaypointId}
        onPatch={(partial) => updatePlan((c) => ({ ...c, ...partial }))}
        onStartRide={startRide}
        onSave={() => void handleSave()}
        saving={saving}
        savedId={saved ? id : undefined}
        onShare={() => void shareRoute(plan)}
        rideHref={id ? `/routes/${id}/ride` : undefined}
      />
    </div>
  );
}
