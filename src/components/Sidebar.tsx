"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Item = { href: string; label: string; icon: string; highlight?: boolean };

const MAIN: Item[] = [
  { href: "/", label: "Accueil", icon: "🏠" },
  { href: "/plants/new", label: "Nouveau plant", icon: "➕", highlight: true },
  { href: "/vue-potager", label: "Vue potager", icon: "🗺️" },
  { href: "/zones", label: "Zones", icon: "📍" },
  { href: "/carres", label: "Carrés", icon: "🟩" },
  { href: "/plants", label: "Plants", icon: "🌱" },
];

const SETTINGS: Item[] = [
  { href: "/settings/mqtt", label: "Connexion MQTT", icon: "📡" },
  { href: "/settings/openplantbook", label: "OpenPlantbook", icon: "🌿" },
  { href: "/settings/users", label: "Utilisateurs", icon: "👤" },
];

function NavLink({ item, active }: { item: Item; active: boolean }) {
  const base = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors";
  const cls = item.highlight
    ? `${base} bg-green-700 font-medium text-white hover:bg-green-800`
    : active
      ? `${base} bg-green-600/15 font-medium text-green-800 dark:text-green-300`
      : `${base} hover:bg-black/5 dark:hover:bg-white/5`;
  return (
    <Link href={item.href} className={cls}>
      <span aria-hidden>{item.icon}</span>
      <span>{item.label}</span>
    </Link>
  );
}

export default function Sidebar({ user, logoutAction }: { user: { nom: string; role: string }; logoutAction: () => Promise<void> }) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href) && !(href === "/plants" && pathname === "/plants/new"));
  return (
    <aside className="flex w-60 shrink-0 flex-col gap-1 border-r border-border bg-card p-3">
      <div className="px-3 py-3 text-lg font-semibold">🌱 Potager</div>
      <nav className="flex flex-col gap-1">
        {MAIN.map((i) => (
          <NavLink key={i.href} item={i} active={isActive(i.href)} />
        ))}
      </nav>
      <div className="mt-4 px-3 text-xs font-semibold uppercase tracking-wide text-muted">Paramètres</div>
      <nav className="flex flex-col gap-1">
        {SETTINGS.map((i) => (
          <NavLink key={i.href} item={i} active={isActive(i.href)} />
        ))}
      </nav>
      <form action={logoutAction} className="mt-auto flex items-center justify-between px-3 pt-4 text-sm">
        <span className="truncate text-muted">{user.nom}</span>
        <button className="text-xs underline">Déconnexion</button>
      </form>
    </aside>
  );
}
