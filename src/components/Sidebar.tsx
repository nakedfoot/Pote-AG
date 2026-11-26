"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type Item = { href: string; label: string; icon: string; highlight?: boolean };

const MAIN: Item[] = [
  { href: "/", label: "Accueil", icon: "🏠" },
  { href: "/plants/new", label: "Nouveau plant", icon: "➕", highlight: true },
  { href: "/vue-potager", label: "Vue potager", icon: "🗺️" },
  { href: "/zones", label: "Zones", icon: "📍" },
  { href: "/carres", label: "Carrés", icon: "🟩" },
];

const SETTINGS: Item[] = [
  { href: "/settings/mqtt", label: "Connexion MQTT", icon: "📡" },
  { href: "/settings/sources", label: "Sources botaniques", icon: "🌿" },
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
  // Replié par défaut ; déplié d'office quand on est sur une page de paramètres, sauf choix contraire de l'utilisateur.
  const [manual, setManual] = useState<boolean | null>(null);
  const settingsOpen = manual ?? pathname.startsWith("/settings");
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <aside className="flex w-60 shrink-0 flex-col gap-1 border-r border-border bg-card p-3">
      <div className="px-3 py-3 text-lg font-semibold">🌱 Potager</div>
      <nav className="flex flex-col gap-1">
        {MAIN.map((i) => (
          <NavLink key={i.href} item={i} active={isActive(i.href)} />
        ))}
      </nav>
      <button
        type="button"
        onClick={() => setManual(!settingsOpen)}
        aria-expanded={settingsOpen}
        aria-controls="menu-parametres"
        className="mt-4 flex w-full items-center justify-between rounded-lg px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted hover:bg-black/5 dark:hover:bg-white/5"
      >
        <span>⚙️ Paramètres</span>
        <span aria-hidden className={`transition-transform ${settingsOpen ? "rotate-90" : ""}`}>›</span>
      </button>
      {settingsOpen && (
        <nav id="menu-parametres" className="flex flex-col gap-1">
          {SETTINGS.map((i) => (
            <NavLink key={i.href} item={i} active={isActive(i.href)} />
          ))}
        </nav>
      )}
      <form action={logoutAction} className="mt-auto flex items-center justify-between px-3 pt-4 text-sm">
        <span className="truncate text-muted">{user.nom}</span>
        <button className="text-xs underline">Déconnexion</button>
      </form>
    </aside>
  );
}
