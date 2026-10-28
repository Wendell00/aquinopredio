import { useSyncExternalStore } from "react";

let connected = false;
const listeners = new Set<() => void>();

export function setRealtimeConnected(value: boolean): void {
  if (connected === value) return;
  connected = value;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Se o canal do Supabase Realtime está conectado. Com ele, o polling do chat vira só uma rede de
 * segurança (intervalo longo); sem ele, volta ao intervalo curto.
 */
export function useRealtimeConnected(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => connected,
    () => false,
  );
}
