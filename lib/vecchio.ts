// Il vecchio archivio (Upstash Redis su Vercel, file JSON in .dati/ in locale), solo da leggere: i progetti che c'erano
// prima di D1 si copiano da qui una volta sola (vedi copiaDalVecchio in progetti.ts). Senza vecchio archivio: null.
import { Redis } from "@upstash/redis";
import { promises as fs } from "node:fs";
import path from "node:path";

const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
const DIR = path.join(process.cwd(), ".dati");

export async function vecchioArchivio() {
  if (url && token) {
    const redis = new Redis({ url, token, automaticDeserialization: false });
    return { get: async <T>(k: string) => { const v = await redis.get<string>(k); return v ? (JSON.parse(v) as T) : null; } };
  }
  if (process.env.VERCEL) return null;
  const file = (k: string) => path.join(DIR, encodeURIComponent(k) + ".json");
  if (!(await fs.stat(file("abita:indice")).catch(() => null))) return null;
  return { get: async <T>(k: string) => { try { return JSON.parse(await fs.readFile(file(k), "utf8")) as T; } catch { return null; } } };
}
