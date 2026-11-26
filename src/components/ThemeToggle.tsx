"use client";

import { useEffect, useState } from "react";

export type Theme = "auto" | "light" | "dark";
const CLE = "potager-theme";
const OPTIONS: { v: Theme; icone: string; label: string }[] = [
  { v: "light", icone: "☀️", label: "Clair" },
  { v: "auto", icone: "🖥️", label: "Auto" },
  { v: "dark", icone: "🌙", label: "Sombre" },
];

/** Applique le thème : « auto » suit le réglage du système. */
function appliquer(t: Theme) {
  const sombre = t === "dark" || (t === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", sombre);
  document.documentElement.style.colorScheme = sombre ? "dark" : "light";
}

/** Choix du mode d'affichage (clair, sombre ou automatique), mémorisé sur cet appareil. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("auto");

  useEffect(() => {
    const t = localStorage.getItem(CLE);
    const initial: Theme = t === "light" || t === "dark" ? t : "auto";
    // Lecture du choix mémorisé (indisponible côté serveur)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTheme(initial);
  }, []);

  // En mode auto, on suit les changements du système en direct
  useEffect(() => {
    if (theme !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const maj = () => appliquer("auto");
    mq.addEventListener("change", maj);
    return () => mq.removeEventListener("change", maj);
  }, [theme]);

  const choisir = (t: Theme) => {
    setTheme(t);
    if (t === "auto") localStorage.removeItem(CLE);
    else localStorage.setItem(CLE, t);
    appliquer(t);
  };

  return (
    <div role="group" aria-label="Mode d'affichage" className="flex overflow-hidden rounded-lg border border-border text-xs">
      {OPTIONS.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => choisir(o.v)}
          aria-pressed={theme === o.v}
          title={o.label}
          className={`flex-1 px-2 py-1.5 ${theme === o.v ? "bg-green-700 text-white" : "hover:bg-black/5 dark:hover:bg-white/5"}`}
        >
          {o.icone} <span className="hidden sm:inline">{o.label}</span>
        </button>
      ))}
    </div>
  );
}
