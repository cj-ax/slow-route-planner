import { useSavedRoutes } from "../hooks/useSavedRoutes";
import { SavedRoutes } from "../components/SavedRoutes";
import { ErrorPanel } from "../components/ErrorPanel";

export function SavedRoutesPage() {
  const { routes, loading, error, remove } = useSavedRoutes();

  return (
    <div className="page saved-page">
      <header className="page__header">
        <h2>Saved routes</h2>
        <p className="muted">Your planned rides — open one to edit or ride it.</p>
      </header>
      {error && <ErrorPanel message={error} />}
      <SavedRoutes routes={routes} loading={loading} onDelete={(id) => void remove(id)} />
    </div>
  );
}
