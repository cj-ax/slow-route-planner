import type { PlaceOption, PlaceType } from "@srp/shared";

const SEARCH_TYPES: PlaceType[] = ["coffee", "beer", "food", "ice_cream", "view"];

interface PlaceOptionsProps {
  options: PlaceOption[];
  selectedPlaceId?: string;
  loading: boolean;
  onSearch: (type: PlaceType) => void;
  onSelect: (place: PlaceOption) => void;
}

export function PlaceOptions({
  options,
  selectedPlaceId,
  loading,
  onSearch,
  onSelect,
}: PlaceOptionsProps) {
  return (
    <section className="panel place-options">
      <div className="panel__header">
        <h3>Endpoint options</h3>
      </div>
      <div className="place-options__search">
        {SEARCH_TYPES.map((t) => (
          <button
            key={t}
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={loading}
            onClick={() => onSearch(t)}
          >
            {t.replace("_", " ")}
          </button>
        ))}
      </div>

      {loading && <p className="muted">Searching…</p>}

      {!loading && options.length === 0 && (
        <p className="muted">Search for a place to end the ride.</p>
      )}

      <ul className="place-list">
        {options.map((place) => {
          const selected = place.id === selectedPlaceId || place.selected;
          return (
            <li
              key={place.id}
              className={`place-card${selected ? " place-card--selected" : ""}`}
            >
              <div className="place-card__body">
                <strong>{place.name}</strong>
                {place.address && <span className="muted">{place.address}</span>}
                {place.reason && <p className="place-card__reason">{place.reason}</p>}
              </div>
              <button
                type="button"
                className={`btn btn--sm ${selected ? "btn--primary" : "btn--ghost"}`}
                onClick={() => onSelect(place)}
              >
                {selected ? "Selected" : "Use as endpoint"}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
