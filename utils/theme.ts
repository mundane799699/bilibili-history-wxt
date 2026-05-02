import { THEME_MODE } from "./constants";
import { getStorageValue, setStorageValue } from "./storage";

export type ThemeMode = "light" | "dark";

const DARK_CLASS = "dark";

const applyClass = (mode: ThemeMode) => {
  const root = document.documentElement;
  if (mode === "dark") root.classList.add(DARK_CLASS);
  else root.classList.remove(DARK_CLASS);
};

export const getTheme = async (): Promise<ThemeMode> => {
  const mode = await getStorageValue<ThemeMode>(THEME_MODE, "light");
  return mode === "dark" ? "dark" : "light";
};

export const setTheme = async (mode: ThemeMode): Promise<void> => {
  applyClass(mode);
  await setStorageValue<ThemeMode>(THEME_MODE, mode);
};

export const toggleTheme = async (): Promise<ThemeMode> => {
  const next: ThemeMode = document.documentElement.classList.contains(DARK_CLASS)
    ? "light"
    : "dark";
  await setTheme(next);
  return next;
};

// Apply persisted theme + subscribe to cross-page changes.
// Safe to call multiple times: listener is keyed on a global flag.
const LISTENER_FLAG = "__bh_themeListenerAttached__";

export const initTheme = (): void => {
  getTheme().then(applyClass);

  const w = window as unknown as Record<string, boolean>;
  if (w[LISTENER_FLAG]) return;
  w[LISTENER_FLAG] = true;

  browser.storage.onChanged.addListener((changes, area) => {
    if (area !== "local" || !changes[THEME_MODE]) return;
    const next = changes[THEME_MODE].newValue as ThemeMode | undefined;
    applyClass(next === "dark" ? "dark" : "light");
  });
};
