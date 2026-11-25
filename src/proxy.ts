import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Pages accessibles sans session. /api/health sert à la supervision (Proxmox, uptime…).
const PUBLIC = new Set(["/login", "/setup", "/api/health"]);

// Contrôle optimiste : la vraie vérification de session se fait côté serveur (requireUser).
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = request.cookies.has("potager_session");
  if (!PUBLIC.has(pathname) && !hasSession) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  // Exclus : ressources statiques, photos (publiques pour Home Assistant) et fichiers PWA (le navigateur les lit sans cookie).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|uploads|icons|sw.js|offline.html|manifest.webmanifest).*)"],
};
