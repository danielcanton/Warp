// ─── View Mode System ──────────────────────────────────────────────
// Three-tier complexity: Explorer (clean), Student (labels), Researcher (all data)

export type ViewMode = "explorer" | "student" | "researcher";

const STORAGE_KEY = "warplab-view-mode";
const URL_PARAM = "mode";
const VALID_MODES: ViewMode[] = ["explorer", "student", "researcher"];

let currentMode: ViewMode = "explorer";
const listeners: Array<(mode: ViewMode) => void> = [];

function isValidMode(value: string): value is ViewMode {
  return VALID_MODES.includes(value as ViewMode);
}

/** Initialize view mode from URL param → localStorage → default */
export function initViewMode(): ViewMode {
  const params = new URLSearchParams(window.location.search);
  const urlMode = params.get(URL_PARAM);

  if (urlMode && isValidMode(urlMode)) {
    currentMode = urlMode;
  } else {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && isValidMode(stored)) {
      currentMode = stored;
    } else {
      currentMode = "explorer";
    }
  }

  // Persist and sync URL
  localStorage.setItem(STORAGE_KEY, currentMode);
  syncURL(currentMode);

  return currentMode;
}

/** Get the current view mode */
export function getViewMode(): ViewMode {
  return currentMode;
}

/** Set the view mode, persist, and notify listeners */
export function setViewMode(mode: ViewMode): void {
  if (!isValidMode(mode) || mode === currentMode) return;
  currentMode = mode;
  localStorage.setItem(STORAGE_KEY, mode);
  syncURL(mode);
  listeners.forEach((fn) => fn(mode));
}

/** Subscribe to view mode changes. Returns unsubscribe function. */
export function onViewModeChange(fn: (mode: ViewMode) => void): () => void {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
}

function syncURL(mode: ViewMode): void {
  const url = new URL(window.location.href);
  url.searchParams.set(URL_PARAM, mode);
  history.replaceState(null, "", url.toString());
}
