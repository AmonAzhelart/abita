// Un solo utente: password per l'editor (cookie firmato), chiave Bearer per Claude.
export const COOKIE = "abita";

export async function firma() {
  const pw = process.env.ABITA_PASSWORD;
  if (!pw) return null;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(pw), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = await crypto.subtle.sign("HMAC", k, new TextEncoder().encode("abita-studio"));
  return Array.from(new Uint8Array(s), b => b.toString(16).padStart(2, "0")).join("");
}

export function uguali(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function cookieValido(v: string | undefined) {
  const f = await firma();
  return !!f && !!v && uguali(v, f);
}

export function chiaveValida(header: string | null) {
  const t = process.env.ABITA_TOKEN, h = header?.replace(/^Bearer\s+/i, "") ?? "";
  return !!t && t.length >= 16 && uguali(h, t);
}
