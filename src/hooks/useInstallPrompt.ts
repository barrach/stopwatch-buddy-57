import { useState, useEffect } from "react";
import { toast } from "sonner";

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
    if (!deferredPrompt) {
      // Fallback: no native prompt available (common on Chrome desktop when SW is self-destroying,
      // or on iOS Safari). Show manual instructions.
      const ua = navigator.userAgent.toLowerCase();
      const isIOS = /iphone|ipad|ipod/.test(ua);
      const isSafari = /safari/.test(ua) && !/chrome|chromium|edg/.test(ua);
      const isFirefox = /firefox/.test(ua);

      let message: string;
      if (isIOS && isSafari) {
        message = "No Safari: toque no botão Compartilhar e escolha 'Adicionar à Tela de Início'.";
      } else if (isFirefox) {
        message = "No Firefox: abra o menu (⋮) e escolha 'Instalar' ou 'Adicionar à Tela Inicial'.";
      } else {
        message = "Abra o menu do navegador (⋮ no canto superior direito) e clique em 'Instalar ProdControl' ou 'Instalar app'.";
      }

      toast.info("Como instalar o app", {
        description: message,
        duration: 10000,
      });
      return false;
    }
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
