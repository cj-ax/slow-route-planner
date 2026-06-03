import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { HomePage } from "./pages/HomePage";
import { SavedRoutesPage } from "./pages/SavedRoutesPage";
import { RouteDetailPage } from "./pages/RouteDetailPage";
import { RidePage } from "./pages/RidePage";
import { SettingsPage } from "./pages/SettingsPage";

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path="/" element={<HomePage />} />
        <Route path="/routes" element={<SavedRoutesPage />} />
        <Route path="/routes/:id" element={<RouteDetailPage />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Route>
      {/* Ride mode is full-screen — outside the app shell. */}
      <Route path="/ride" element={<RidePage />} />
      <Route path="/routes/:id/ride" element={<RidePage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
