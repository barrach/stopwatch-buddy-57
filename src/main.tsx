import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

// Nuke ALL caches on every page load to guarantee freshness
if ("caches" in window) {
  caches.keys().then((names) => {
    for (const name of names) {
      caches.delete(name);
    }
  });
}

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // Auto-accept updates — never prompt the user
    updateSW(true);
  },
  onOfflineReady() {
    // noop
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;

    // Immediately check for a waiting SW and activate it
    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }

    const forceUpdate = () => {
      registration.update().catch(() => {});
    };

    window.addEventListener("focus", forceUpdate);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") forceUpdate();
    });

    // Check every 15 seconds
    setInterval(forceUpdate, 15000);
  },
});

let refreshing = false;
navigator.serviceWorker?.addEventListener("controllerchange", () => {
  if (refreshing) return;
  refreshing = true;
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
