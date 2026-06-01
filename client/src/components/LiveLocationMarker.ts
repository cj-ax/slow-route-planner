// MapLibre markers are DOM elements, so the "live location marker" is a small
// element factory rather than a React component. RideMode attaches it to a
// maplibregl.Marker. The pulse + heading wedge are styled in global.css.
export function createLiveLocationElement(): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "live-marker";
  el.innerHTML =
    '<span class="live-marker__pulse"></span><span class="live-marker__dot"></span>';
  return el;
}

/** Rotate the marker to a compass heading (degrees), if available. */
export function setLiveLocationHeading(el: HTMLElement, heading?: number): void {
  if (heading === undefined || Number.isNaN(heading)) {
    el.style.removeProperty("--heading");
    el.classList.remove("live-marker--directed");
    return;
  }
  el.style.setProperty("--heading", `${heading}deg`);
  el.classList.add("live-marker--directed");
}
