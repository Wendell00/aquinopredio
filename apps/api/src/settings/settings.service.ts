import { Injectable } from "@nestjs/common";
import { DataSource } from "typeorm";
import { SETTINGS_DEFAULTS, type SettingKey, type SettingValue } from "./settings.defaults";

const CACHE_MS = 60_000;

@Injectable()
export class SettingsService {
  private cache: { values: Map<string, unknown>; loadedAt: number } | null = null;

  constructor(private readonly dataSource: DataSource) {}

  async get<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
    const overrides = await this.overrides();
    return (overrides.has(key) ? overrides.get(key) : SETTINGS_DEFAULTS[key]) as SettingValue<K>;
  }

  async all(): Promise<Record<SettingKey, unknown>> {
    const overrides = await this.overrides();
    return Object.fromEntries(
      Object.entries(SETTINGS_DEFAULTS).map(([key, value]) => [key, overrides.get(key) ?? value]),
    ) as Record<SettingKey, unknown>;
  }

  async set(key: SettingKey, value: unknown, updatedBy: string): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [key, JSON.stringify(value), updatedBy],
    );
    this.cache = null;
  }

  private async overrides(): Promise<Map<string, unknown>> {
    if (this.cache && Date.now() - this.cache.loadedAt < CACHE_MS) return this.cache.values;
    const rows: { key: string; value: unknown }[] = await this.dataSource.query(
      "SELECT key, value FROM settings",
    );
    const values = new Map(rows.map((row) => [row.key, row.value]));
    this.cache = { values, loadedAt: Date.now() };
    return values;
  }
}
