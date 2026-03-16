import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App.tsx";
import "./index.css";

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateSW(true);
  },
  onOfflineReady() {
    // noop
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;

    const forceUpdate = () => {
      registration.update().catch(() => {
        // noop
      });
    };

    window.addEventListener("focus", forceUpdate);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") forceUpdate();
    });

    setInterval(forceUpdate, 30000);
  },
});

let refreshing = false;
navigator.serviceWorker?.addEventListener("controllerchange", () => {
  if (refreshing) return;
  refreshing = true;
  window.location.reload();
});

createRoot(document.getElementById("root")!).render(<App />);
