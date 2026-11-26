"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Vignette avec une icône de zoom en haut à droite : un clic l'affiche en plus gros, au milieu de la page, un second clic
 * (ou Échap, ou un clic à côté) la remet à sa place. Sa place reste réservée dans la grille pendant le zoom.
 * Pendant le zoom, la variable CSS `--zoom` vaut 1.6 (les dessins à taille plafonnée peuvent s'en servir).
 */
export default function Zoomable({ children, className = "", style, wide = false }: { children: React.ReactNode; className?: string; style?: React.CSSProperties; wide?: boolean }) {
  const [zoom, setZoom] = useState(false);
  const [h, setH] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!zoom) return;
    const key = (e: KeyboardEvent) => e.key === "Escape" && setZoom(false);
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [zoom]);

  const basculer = () => {
    if (!zoom) setH(ref.current?.offsetHeight ?? 0);
    setZoom(!zoom);
  };

  return (
    <div style={zoom ? { minHeight: h } : undefined}>
      {zoom && <div className="fixed inset-0 z-40 bg-black/50" onClick={() => setZoom(false)} aria-hidden />}
      <div
        ref={ref}
        style={{ ...style, ...(zoom ? ({ "--zoom": 1.6 } as React.CSSProperties) : {}) }}
        className={`${className} ${zoom ? `fixed left-1/2 top-1/2 z-50 max-h-[94vh] ${wide ? "w-[96vw]" : "w-[min(96vw,64rem)]"} -translate-x-1/2 -translate-y-1/2 overflow-y-auto shadow-2xl` : "relative h-full"}`}
      >
        <button
          type="button"
          onClick={basculer}
          aria-label={zoom ? "Revenir à la vue normale" : "Agrandir"}
          title={zoom ? "Revenir à la vue normale" : "Agrandir"}
          className="absolute right-2 top-2 z-30 flex h-7 w-7 items-center justify-center rounded-lg bg-black/5 text-sm hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
        >
          🔍
        </button>
        {children}
      </div>
    </div>
  );
}
