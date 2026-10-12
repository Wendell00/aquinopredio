import type { Redis } from "ioredis";

/** Cache simples de JSON no Redis. Falha de Redis não derruba a requisição: só não cacheia. */
export async function cached<T>(
  redis: Redis,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  const hit = await redis.get(key).catch(() => null);
  if (hit !== null) return JSON.parse(hit) as T;
  const value = await load();
  if (value !== null && value !== undefined) {
    await redis.set(key, JSON.stringify(value), "EX", ttlSeconds).catch(() => undefined);
  }
  return value;
}
