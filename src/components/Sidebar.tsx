"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import ThemeToggle from "@/components/ThemeToggle";

type Item = { href: string; label: string; icon: string; highlight?: boolean };

const MAIN: Item[] = [
  { href: "/plants/new", label: "Nouveau plant", icon: "➕", highlight: true },
  { href: "/synthese", label: "Synthèse", icon: "📊" },
  { href: "/", label: "Plants", icon: "🌱" },
  { href: "/vue-potager", label: "Vue potager", icon: "🗺️" },
  { href: "/zones", label: "Zones", icon: "📍" },
  { href: "/carres", label: "Carrés", icon: "🟩" },
];

const SETTINGS: Item[] = [
  { href: "/settings/mqtt", label: "Connexion MQTT", icon: "📡" },
  { href: "/settings/sources", label: "Sources botaniques", icon: "🌿" },
  { href: "/settings/users", label: "Utilisateurs", icon: "👤" },
];

/** Petit indicateur sur le lien cliqué tant que la page n'est pas arrivée. */
function Pending() {
  const { pending } = useLinkStatus();
  return pending ? <span aria-hidden className="ml-auto h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : null;
}

function NavLink({ item, active, onNavigate }: { item: Item; active: boolean; onNavigate: () => void }) {
  const base = "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors";
  const cls = item.highlight
    ? `${base} bg-green-700 font-medium text-white hover:bg-green-800`
    : active
      ? `${base} bg-green-600/15 font-medium text-green-800 dark:text-green-300`
      : `${base} hover:bg-black/5 dark:hover:bg-white/5`;
  return (
    <Link href={item.href} prefetch className={cls} onClick={onNavigate}>
      <span aria-hidden>{item.icon}</span>
      <span>{item.label}</span>
      <Pending />
    </Link>
  );
}

export default function Sidebar({ user, logoutAction }: { user: { nom: string; role: string }; logoutAction: () => Promise<void> }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false); // tiroir de navigation (mobile uniquement)
  const close = () => setOpen(false);
  // Replié par défaut ; déplié d'office quand on est sur une page de paramètres, sauf choix contraire de l'utilisateur.
  const [manual, setManual] = useState<boolean | null>(null);
  const settingsOpen = manual ?? pathname.startsWith("/settings");
  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  return (
    <>
    <header className="sticky top-0 z-40 flex items-center justify-between border-b border-border bg-card px-4 py-2 md:hidden">
      <span className="text-lg font-semibold">🌱 Potager</span>
      <button type="button" onClick={() => setOpen(true)} aria-label="Ouvrir le menu" aria-expanded={open} className="rounded-lg px-3 py-1.5 text-xl hover:bg-black/5 dark:hover:bg-white/5">☰</button>
    </header>
    {open && <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={close} aria-hidden />}
    <aside className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col gap-1 overflow-y-auto border-r border-border bg-card p-3 transition-transform md:static md:w-60 md:shrink-0 md:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}>
      <div className="flex items-center justify-between px-3 py-3 text-lg font-semibold">
        <span>🌱 Potager</span>
        <button type="button" onClick={close} aria-label="Fermer le menu" className="text-base md:hidden">✕</button>
      </div>
      <nav className="flex flex-col gap-1">
        {MAIN.map((i) => (
          <NavLink key={i.href} item={i} active={isActive(i.href)} onNavigate={close} />
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
            <NavLink key={i.href} item={i} active={isActive(i.href)} onNavigate={close} />
          ))}
        </nav>
      )}
      <div className="mt-auto px-1 pt-4"><ThemeToggle /></div>
      <form action={logoutAction} className="flex items-center justify-between px-3 pt-3 text-sm">
        <span className="truncate text-muted">{user.nom}</span>
        <button className="text-xs underline">Déconnexion</button>
      </form>
    </aside>
    </>
  );
}
