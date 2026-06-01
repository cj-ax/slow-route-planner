import { useState } from "react";
import type { EndpointIntent, RideType, RouteRequest } from "@srp/shared";
import { api } from "../api/client";

const EXAMPLE_PROMPT =
  "Create a slow motorcycle ride around Lake Minnetonka. Avoid highways and fast multilane roads. Add a few detours into quiet residential areas. Prioritize lake views, curves, trees, and small-town main streets. End near Excelsior somewhere good for a casual beer, coffee, or patio snack. Target 90–120 minutes.";

const RIDE_TYPES: RideType[] = ["motorcycle", "car", "bike", "ebike"];
const ENDPOINT_INTENTS: EndpointIntent[] = [
  "beer",
  "coffee",
  "food",
  "ice_cream",
  "view",
  "custom",
];

interface PromptFormProps {
  loading: boolean;
  onGenerate: (request: RouteRequest) => void;
}

export function PromptForm({ loading, onGenerate }: PromptFormProps) {
  const [rawPrompt, setRawPrompt] = useState(EXAMPLE_PROMPT);
  const [startLocation, setStartLocation] = useState("Wayzata, MN");
  const [rideType, setRideType] = useState<RideType>("motorcycle");
  const [endpointIntent, setEndpointIntent] = useState<EndpointIntent>("beer");
  const [targetDuration, setTargetDuration] = useState<string>("105");
  const [avoid, setAvoid] = useState<string[]>([]);
  const [prefer, setPrefer] = useState<string[]>([]);
  const [autofilling, setAutofilling] = useState(false);

  function buildRequest(): RouteRequest {
    return {
      rawPrompt,
      startLocation,
      endpointIntent,
      rideType,
      targetDurationMinutes: targetDuration ? Number(targetDuration) : undefined,
      avoid,
      prefer,
    };
  }

  async function handleAutofill() {
    if (!rawPrompt.trim()) return;
    setAutofilling(true);
    try {
      const parsed = await api.parsePrompt({ rawPrompt });
      if (parsed.rideType) setRideType(parsed.rideType);
      if (parsed.endpointIntent) setEndpointIntent(parsed.endpointIntent);
      if (parsed.targetDurationMinutes) {
        setTargetDuration(String(parsed.targetDurationMinutes));
      }
      if (parsed.area && !startLocation.trim()) setStartLocation(parsed.area);
      setAvoid(parsed.avoid ?? []);
      setPrefer(parsed.prefer ?? []);
    } catch {
      /* non-blocking */
    } finally {
      setAutofilling(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onGenerate(buildRequest());
  }

  return (
    <form className="prompt-form panel" onSubmit={handleSubmit}>
      <label className="field">
        <span className="field__label">Describe the ride you want</span>
        <textarea
          className="field__input field__textarea"
          rows={5}
          value={rawPrompt}
          onChange={(e) => setRawPrompt(e.target.value)}
          placeholder="e.g. A slow scenic loop avoiding highways, ending somewhere for coffee..."
        />
      </label>

      <div className="field-row">
        <label className="field">
          <span className="field__label">Start location</span>
          <input
            className="field__input"
            value={startLocation}
            onChange={(e) => setStartLocation(e.target.value)}
            placeholder="Town, address, or landmark"
          />
        </label>
        <label className="field">
          <span className="field__label">Ride type</span>
          <select
            className="field__input"
            value={rideType}
            onChange={(e) => setRideType(e.target.value as RideType)}
          >
            {RIDE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="field-row">
        <label className="field">
          <span className="field__label">End with</span>
          <select
            className="field__input"
            value={endpointIntent}
            onChange={(e) => setEndpointIntent(e.target.value as EndpointIntent)}
          >
            {ENDPOINT_INTENTS.map((t) => (
              <option key={t} value={t}>
                {t.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field__label">Target minutes (optional)</span>
          <input
            className="field__input"
            type="number"
            min={15}
            max={600}
            value={targetDuration}
            onChange={(e) => setTargetDuration(e.target.value)}
          />
        </label>
      </div>

      {(avoid.length > 0 || prefer.length > 0) && (
        <div className="chip-summary">
          {avoid.map((a) => (
            <span key={`a-${a}`} className="chip chip--avoid">
              avoid: {a}
            </span>
          ))}
          {prefer.map((p) => (
            <span key={`p-${p}`} className="chip chip--prefer">
              prefer: {p}
            </span>
          ))}
        </div>
      )}

      <div className="prompt-form__actions">
        <button
          type="button"
          className="btn btn--ghost"
          onClick={handleAutofill}
          disabled={autofilling || loading}
        >
          {autofilling ? "Reading…" : "Auto-fill from prompt"}
        </button>
        <button type="submit" className="btn btn--primary" disabled={loading}>
          {loading ? "Generating…" : "Generate route"}
        </button>
      </div>
    </form>
  );
}
