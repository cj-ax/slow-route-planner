import { useState } from "react";
import { mdiClipboardTextOutline, mdiCoffee, mdiMapMarkerMultiple } from "@mdi/js";
import type { PlaceOption, PlaceType, RoutePlan, Waypoint } from "@srp/shared";
import { WaypointEditor } from "./WaypointEditor";
import { RouteNotes } from "./RouteNotes";
import { PlaceOptions } from "./PlaceOptions";

type Panel = "waypoints" | "places" | "notes";

function Icon({ path }: { path: string }) {
  return (
    <svg className="mdi" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d={path} fill="currentColor" />
    </svg>
  );
}

interface RouteToolsProps {
  plan: RoutePlan;
  selectedWaypointId?: string;
  onSelectWaypoint: (id: string) => void;
  onChangeWaypoints: (next: Waypoint[]) => void;
  placeOptions: PlaceOption[];
  placesLoading: boolean;
  selectedPlaceId?: string;
  onSearchPlaces: (type: PlaceType) => void;
  onSelectPlace: (place: PlaceOption) => void;
}

const TITLES: Record<Panel, string> = {
  waypoints: "Waypoints",
  places: "Endpoint options",
  notes: "Route notes & checks",
};

/**
 * Floating map controls that open the route's editing surfaces on demand,
 * keeping the main drawer focused on the route overview.
 */
export function RouteTools({
  plan,
  selectedWaypointId,
  onSelectWaypoint,
  onChangeWaypoints,
  placeOptions,
  placesLoading,
  selectedPlaceId,
  onSearchPlaces,
  onSelectPlace,
}: RouteToolsProps) {
  const [panel, setPanel] = useState<Panel | null>(null);
  const notesCount =
    plan.avoidRoads.length + plan.routeNotes.length + plan.manualChecks.length;

  return (
    <>
      <div className="map-fabs">
        <button
          type="button"
          className="map-fab"
          aria-label="Waypoints"
          title="Waypoints"
          onClick={() => setPanel("waypoints")}
        >
          <Icon path={mdiMapMarkerMultiple} />
          {plan.waypoints.length > 0 && (
            <span className="map-fab__badge">{plan.waypoints.length}</span>
          )}
        </button>
        <button
          type="button"
          className="map-fab"
          aria-label="Endpoint options"
          title="Places"
          onClick={() => setPanel("places")}
        >
          <Icon path={mdiCoffee} />
        </button>
        {notesCount > 0 && (
          <button
            type="button"
            className="map-fab"
            aria-label="Route notes & checks"
            title="Notes"
            onClick={() => setPanel("notes")}
          >
            <Icon path={mdiClipboardTextOutline} />
            <span className="map-fab__badge">{notesCount}</span>
          </button>
        )}
      </div>

      {panel && (
        <div className="map-panel__backdrop" onClick={() => setPanel(null)}>
          <div
            className="map-panel"
            role="dialog"
            aria-label={TITLES[panel]}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="map-panel__head">
              <h3>{TITLES[panel]}</h3>
              <button
                type="button"
                className="map-panel__close"
                onClick={() => setPanel(null)}
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="map-panel__body">
              {panel === "waypoints" && (
                <WaypointEditor
                  waypoints={plan.waypoints}
                  selectedId={selectedWaypointId}
                  onSelectWaypoint={(id) => {
                    onSelectWaypoint(id);
                    setPanel(null);
                  }}
                  onChange={onChangeWaypoints}
                />
              )}
              {panel === "places" && (
                <PlaceOptions
                  options={placeOptions.length ? placeOptions : plan.foodDrinkOptions}
                  selectedPlaceId={selectedPlaceId}
                  loading={placesLoading}
                  onSearch={onSearchPlaces}
                  onSelect={onSelectPlace}
                />
              )}
              {panel === "notes" && <RouteNotes plan={plan} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
