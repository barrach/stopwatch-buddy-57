import { useState, useCallback } from "react";
import { MOCK_RECORDS, type ObservationRecord } from "@/data/mockData";

// Simple global state for records (will be replaced by DB later)
let globalRecords = [...MOCK_RECORDS];
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => fn());
}

export function useRecords() {
  const [, setTick] = useState(0);

  const subscribe = useCallback(() => {
    const rerender = () => setTick((t) => t + 1);
    listeners.add(rerender);
    return () => { listeners.delete(rerender); };
  }, []);

  // Subscribe on mount
  useState(() => {
    const unsub = subscribe();
    return unsub;
  });

  const deleteRecord = useCallback((id: string) => {
    globalRecords = globalRecords.filter((r) => r.id !== id);
    notify();
  }, []);

  return { records: globalRecords, deleteRecord };
}
