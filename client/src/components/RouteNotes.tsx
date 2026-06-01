import type { RoutePlan } from "@srp/shared";

function NoteList({
  title,
  items,
  variant,
}: {
  title: string;
  items: string[];
  variant?: "warn";
}) {
  if (!items?.length) return null;
  return (
    <div className={`note-block${variant === "warn" ? " note-block--warn" : ""}`}>
      <h4 className="note-block__title">{title}</h4>
      <ul className="note-block__list">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function RouteNotes({ plan }: { plan: RoutePlan }) {
  return (
    <div className="route-notes">
      <NoteList title="Avoiding" items={plan.avoidRoads} />
      <NoteList title="Route notes" items={plan.routeNotes} />
      <NoteList title="Manual checks before riding" items={plan.manualChecks} variant="warn" />
    </div>
  );
}
