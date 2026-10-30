import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, cookieValido } from "./lib/auth.ts";

// Editor, API dell'editor e foto: solo con il cookie. Il link del cliente (/v) e l'MCP (/api/mcp, con chiave) restano fuori.
export async function proxy(req: NextRequest) {
  if (await cookieValido(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  if (req.nextUrl.pathname.startsWith("/api/")) return NextResponse.json({ errore: "Accesso richiesto" }, { status: 401 });
  const u = new URL("/login", req.url);
  u.searchParams.set("dopo", req.nextUrl.pathname);
  return NextResponse.redirect(u);
}

export const config = { matcher: ["/studio/:path*", "/api/studio/:path*", "/api/foto/:path*"] };
