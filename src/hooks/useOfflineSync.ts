import { useEffect, useCallback, useRef } from "react";
import { syncQueue, getQueuedItems } from "@/lib/offlineQueue";
import { useToast } from "@/hooks/use-toast";

export function useOnlineStatus() {
  const isOnline = typeof navigator !== "undefined" ? navigator.onLine : true;
  return isOnline;
}

export function useOfflineSync() {
  const { toast } = useToast();
  const syncingRef = useRef(false);

  const doSync = useCallback(async () => {
    if (syncingRef.current || !navigator.onLine) return;
    syncingRef.current = true;

    try {
      const items = await getQueuedItems();
      if (items.length === 0) return;

      const result = await syncQueue();
      if (result.synced > 0) {
        toast({
          title: "Dados sincronizados",
          description: `${result.synced} registro(s) enviado(s) com sucesso.`,
        });
      }
      if (result.failed > 0) {
        toast({
          title: "Falha parcial na sincronização",
          description: `${result.failed} registro(s) falharam. Tentaremos novamente.`,
          variant: "destructive",
        });
      }
    } finally {
      syncingRef.current = false;
    }
  }, [toast]);

  useEffect(() => {
    // Sync when coming back online
    const handleOnline = () => {
      doSync();
    };

    window.addEventListener("online", handleOnline);

    // Also try syncing on mount
    doSync();

    // Periodic sync every 30s
    const interval = setInterval(doSync, 30000);

    return () => {
      window.removeEventListener("online", handleOnline);
      clearInterval(interval);
    };
  }, [doSync]);

  return { syncNow: doSync };
}
