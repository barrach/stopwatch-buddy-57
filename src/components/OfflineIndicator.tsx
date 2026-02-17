import { useEffect, useState } from "react";
import { WifiOff, Wifi } from "lucide-react";
import { getQueuedItems } from "@/lib/offlineQueue";

export function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);

  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  useEffect(() => {
    const check = async () => {
      const items = await getQueuedItems();
      setPendingCount(items.length);
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, []);

  if (isOnline && pendingCount === 0) return null;

  return (
    <div className={`mb-4 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium ${
      isOnline ? "bg-warning/10 text-warning" : "bg-destructive/10 text-destructive"
    }`}>
      {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
      {!isOnline && "Você está offline — dados serão salvos localmente"}
      {isOnline && pendingCount > 0 && `Sincronizando ${pendingCount} registro(s) pendente(s)...`}
    </div>
  );
}
