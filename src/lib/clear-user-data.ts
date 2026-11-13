/**
 * Removes every copy of the signed-in user's data held by the browser.
 * Called on logout and after account deletion so the next person on the device
 * (or the same person re-registering) never sees stale profile data.
 *
 * Device preferences (theme, language, navigation style) are kept.
 */
const KEEP_LOCAL_KEYS = [
  "campusfleet_theme",
  "campusfleet_nav_style",
  "campusfleet_lang",
  "campusfleet_lang_secondary",
];

export async function clearClientUserData(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    const kept: Record<string, string> = {};
    for (const key of KEEP_LOCAL_KEYS) {
      const value = localStorage.getItem(key);
      if (value !== null) kept[key] = value;
    }
    localStorage.clear();
    for (const [key, value] of Object.entries(kept)) localStorage.setItem(key, value);
  } catch {}

  try {
    sessionStorage.clear();
  } catch {}

  // Service-worker caches can hold server-rendered portal pages with the user's name/photo.
  try {
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
  } catch {}
}
