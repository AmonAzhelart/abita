// Dove stanno i dati: Upstash Redis se configurato (Vercel), altrimenti file JSON in .dati/ (solo in locale).
import { Redis } from "@upstash/redis";
import { promises as fs } from "node:fs";
import path from "node:path";

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const redis = url && token ? new Redis({ url, token, automaticDeserialization: false }) : null;
const DIR = path.join(process.cwd(), ".dati");
const file = (k: string) => path.join(DIR, encodeURIComponent(k) + ".json");

function locale() {
  if (process.env.VERCEL) throw new Error("Manca il database: su Vercel aggiungi Upstash for Redis (Storage) a questo progetto.");
}

export const kv = {
  async get<T>(k: string): Promise<T | null> {
    if (redis) { const v = await redis.get<string>(k); return v ? (JSON.parse(v) as T) : null; }
    locale();
    try { return JSON.parse(await fs.readFile(file(k), "utf8")) as T; } catch { return null; }
  },
  async set(k: string, v: unknown) {
    const s = JSON.stringify(v);
    if (redis) { await redis.set(k, s); return; }
    locale();
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(file(k), s);
  },
  async del(k: string) {
    if (redis) { await redis.del(k); return; }
    locale();
    await fs.rm(file(k), { force: true });
  },
};
