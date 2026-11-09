import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { loadLogs, logsToGeoJSON, logsToGpx, newLog, saveLog, deleteLog, seasonForDate, LOG_SCHEMA_VERSION } from "../lib/logs";

describe("logs", () => {
  it("creates a versioned record with context", () => {
    const l = newLog("scrape", [-93.123456789, 44.987654321], { now: new Date("2026-11-05T07:30:00"), notes: "fresh" });
    expect(l.schemaVersion).toBe(LOG_SCHEMA_VERSION);
    expect(l.lon).toBe(-93.123457);
    expect(l.season).toBe("rut");
    expect(l.timeOfDay).toBe("dawn");
    expect(l.notes).toBe("fresh");
  });

  it("season boundaries", () => {
    expect(seasonForDate(new Date("2026-09-20T12:00:00"))).toBe("early");
    expect(seasonForDate(new Date("2026-10-30T12:00:00"))).toBe("rut");
    expect(seasonForDate(new Date("2026-12-10T12:00:00"))).toBe("late");
    expect(seasonForDate(new Date("2027-01-02T12:00:00"))).toBe("late");
  });

  it("exports GPX with escaped text and GeoJSON with props", () => {
    const l = newLog("rub", [-93.5, 44.8], { notes: "big <rub> & tracks" });
    const gpx = logsToGpx([l]);
    expect(gpx).toContain('<wpt lat="44.8" lon="-93.5">');
    expect(gpx).toContain("big &lt;rub&gt; &amp; tracks");
    const gj = logsToGeoJSON([l]);
    expect(gj.features[0].geometry.coordinates).toEqual([-93.5, 44.8]);
    expect(gj.features[0].properties).toMatchObject({ type: "rub", schemaVersion: 1 });
  });

  it("persists in IndexedDB", async () => {
    const a = newLog("bed", [-93.5, 44.8], { now: new Date("2026-11-01T08:00:00") });
    const b = newLog("buck", [-93.4, 44.8], { now: new Date("2026-11-02T08:00:00"), count: 1 });
    await saveLog(a);
    await saveLog(b);
    let all = await loadLogs();
    expect(all.map((x) => x.id)).toEqual([b.id, a.id]);
    await deleteLog(a.id);
    all = await loadLogs();
    expect(all).toHaveLength(1);
  });
});
