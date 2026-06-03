import { useState } from "react";
import type { PlaceOption, PlaceType, RoutePlan, Waypoint } from "@srp/shared";
import { WaypointEditor } from "./WaypointEditor";
import { RouteNotes } from "./RouteNotes";
import { PlaceOptions } from "./PlaceOptions";

type Panel = "waypoints" | "places" | "notes";

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
        <button type="button" className="map-fab" onClick={() => setPanel("waypoints")}>
          <span className="map-fab__icon" aria-hidden="true">📍</span>
          <span className="map-fab__label">Waypoints</span>
          <span className="map-fab__count">{plan.waypoints.length}</span>
        </button>
        <button type="button" className="map-fab" onClick={() => setPanel("places")}>
          <span className="map-fab__icon" aria-hidden="true">☕</span>
          <span className="map-fab__label">Places</span>
        </button>
        {notesCount > 0 && (
          <button type="button" className="map-fab" onClick={() => setPanel("notes")}>
            <span className="map-fab__icon" aria-hidden="true">📋</span>
            <span className="map-fab__label">Notes</span>
            <span className="map-fab__count">{notesCount}</span>
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
