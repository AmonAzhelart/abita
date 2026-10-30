import { NextResponse } from "next/server";
import { COOKIE, firma, uguali } from "@/lib/auth";

export async function POST(req: Request) {
  const f = await req.formData(), pw = String(f.get("password") ?? ""), dopo = String(f.get("dopo") ?? "");
  const vai = (p: string) => NextResponse.redirect(new URL(p, req.url), 303);
  if (f.get("esci")) {
    const r = vai("/login");
    r.cookies.delete(COOKIE);
    return r;
  }
  const atteso = process.env.ABITA_PASSWORD;
  if (!atteso) return vai("/login?errore=config");
  await new Promise(r => setTimeout(r, 400));          // rallenta chi prova password a caso
  if (!uguali(pw, atteso)) return vai("/login?errore=1" + (dopo ? `&dopo=${encodeURIComponent(dopo)}` : ""));
  const r = vai(dopo.startsWith("/studio") ? dopo : "/studio");
  r.cookies.set(COOKIE, (await firma())!, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 90 });
  return r;
}
