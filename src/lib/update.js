// Keeping the installed app (PWA) up to date.
//
// The service worker is in autoUpdate mode: once a new version is downloaded it
// takes over and the page reloads itself. Phones often resume the app from the
// background without checking, so we also check whenever the app comes back to
// the screen, and Settings has a "Check for updates" button.
import { registerSW } from "virtual:pwa-register";

let reg = null;

export function startUpdates() {
  registerSW({
    immediate: true,
    onRegisteredSW(_url, r) {
      if (!r) return;
      reg = r;
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") r.update().catch(() => {});
      });
    },
  });
}

/**
 * Ask the server for a newer version now.
 * Resolves "updating" (the page reloads by itself in a moment), "latest", or "unavailable".
 */
export async function checkForUpdate() {
  if (!reg) return "unavailable";
  await reg.update();
  if (reg.installing || reg.waiting) {
    // autoUpdate activates it and reloads; if it waits (old app), push it along
    reg.waiting?.postMessage({ type: "SKIP_WAITING" });
    setTimeout(() => location.reload(), 4000); // in case the reload doesn't come
    return "updating";
  }
  return "latest";
}

// when this version was built, shown in Settings
export const BUILD = typeof __BUILD__ === "string" ? __BUILD__ : "dev";
