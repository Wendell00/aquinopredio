/** "a 350 m" / "a 1,2 km" — distância aproximada, nunca o endereço (RN-034). */
export function formatDistance(meters: number | null | undefined): string | null {
  if (meters === null || meters === undefined) return null;
  if (meters < 50) return "no mesmo local";
  if (meters < 1000) return `a ${Math.round(meters / 50) * 50} m`;
  return `a ${(meters / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`;
}

export function formatCep(cep: string): string {
  const digits = cep.replace(/\D/g, "");
  return digits.length === 8 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : cep;
}

export function plural(count: number, one: string, many: string): string {
  return `${count.toLocaleString("pt-BR")} ${count === 1 ? one : many}`;
}

/** "agora", "há 5 min", "há 3 h", "há 2 dias", "12 de out." */
export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (seconds < 60) return "agora";
  if (seconds < 3600) return `há ${Math.floor(seconds / 60)} min`;
  if (seconds < 86_400) return `há ${Math.floor(seconds / 3600)} h`;
  const days = Math.floor(seconds / 86_400);
  if (days < 7) return `há ${days} dia${days === 1 ? "" : "s"}`;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "numeric", month: "short" });
}
