import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

async function clearBrowserCaches() {
  if (!("caches" in window)) return;

  const names = await caches.keys();
  await Promise.all(names.map((name) => caches.delete(name)));
}

async function unregisterServiceWorkers() {
  if (!("serviceWorker" in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(
    registrations.map(async (registration) => {
      try {
        registration.waiting?.postMessage({ type: "SKIP_WAITING" });
        await registration.unregister();
      } catch {
        // noop
      }
    }),
  );
}

void Promise.allSettled([clearBrowserCaches(), unregisterServiceWorkers()]).finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
