import { useState, useEffect } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function useInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    if (window.matchMedia("(display-mode: standalone)").matches) {
      setIsInstalled(true);
      return;
    }

    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handler);

    window.addEventListener("appinstalled", () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const install = async () => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return outcome === "accepted";
  };

  // Show button if: has deferred prompt OR (is in browser, not installed, not in iframe)
  const isInBrowser = !isInstalled && typeof window !== 'undefined' && !window.matchMedia("(display-mode: standalone)").matches;
  const isInIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
  const canInstall = (!!deferredPrompt && !isInstalled) || (isInBrowser && !isInIframe);

  console.log("useInstallPrompt:", { canInstall, isInstalled, hasDeferredPrompt: !!deferredPrompt, isInBrowser, isInIframe });

  return { canInstall, isInstalled, install };
}
