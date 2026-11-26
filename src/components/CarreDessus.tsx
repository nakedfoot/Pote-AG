import { useId } from "react";
import { EPAISSEUR_CM } from "@/lib/carres";

const DEFAUT_CM = 120; // dimensions supposées quand elles ne sont pas renseignées
const HAUTEUR_MAX_REM = 22; // un carré très profond ne dépasse pas cette hauteur

/**
 * Carré potager vu du dessus, à l'échelle : cadre en bois (planches de 2,1 cm) et terre.
 * `children` est affiché sur la terre : un repère couvre exactement la surface de terre
 * (`data-carre-soil`), pour y positionner des éléments en fractions 0..1.
 * Le conteneur porte `data-carre-box` (cible de dépôt pour le glisser-déposer).
 */
export default function CarreDessus({
  carreId, longueur, largeur, children, className = "", fill = false,
}: {
  carreId?: number; longueur: number | null; largeur: number | null; children?: React.ReactNode; className?: string;
  /** Occupe toute la largeur du parent (sans plafond de hauteur) */
  fill?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const L = longueur || DEFAUT_CM;
  const Wd = largeur || DEFAUT_CM;
  const k = 240 / Math.max(L, Wd); // unités du dessin par cm
  const vw = L * k, vh = Wd * k, t = EPAISSEUR_CM * k;
  const ix = (EPAISSEUR_CM / L) * 100;
  const iy = (EPAISSEUR_CM / Wd) * 100;
  const f = (n: string) => `url(#${n}${uid})`;
  const planche = "#c58d52";

  return (
    <div
      data-carre-box={carreId}
      className={`relative mx-auto select-none ${className}`}
      style={{ aspectRatio: `${L} / ${Wd}`, width: fill ? "100%" : `min(100%, calc(${(L / Wd) * HAUTEUR_MAX_REM}rem * var(--zoom, 1)))` }}
    >
      <svg viewBox={`0 0 ${vw} ${vh}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full drop-shadow-md" aria-hidden>
        <defs>
          <filter id={`gh${uid}`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.55" numOctaves="3" seed="7" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.18  0 0 0 0 0.09  0 0 0 0 0.03  1.5 0 0 0 -0.4" result="c" />
            <feComposite in="c" in2="SourceAlpha" operator="in" />
          </filter>
          <filter id={`gv${uid}`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.55 0.012" numOctaves="3" seed="9" result="n" />
            <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.18  0 0 0 0 0.09  0 0 0 0 0.03  1.5 0 0 0 -0.4" result="c" />
            <feComposite in="c" in2="SourceAlpha" operator="in" />
          </filter>
          <filter id={`terre${uid}`} x="0" y="0" width="100%" height="100%">
            <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="11" result="n" />
            <feColorMatrix in="n" type="matrix" values="0.36 0 0 0 0.03  0.24 0 0 0 0.02  0.15 0 0 0 0.01  0 0 0 0 1" result="c" />
            <feComposite in="c" in2="SourceAlpha" operator="in" />
          </filter>
          <linearGradient id={`ombreH${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#000" stopOpacity="0.5" /><stop offset="0.12" stopColor="#000" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`ombreV${uid}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#000" stopOpacity="0.4" /><stop offset="0.1" stopColor="#000" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Terre */}
        <rect x={t} y={t} width={vw - 2 * t} height={vh - 2 * t} fill="#2a1a0e" />
        <rect x={t} y={t} width={vw - 2 * t} height={vh - 2 * t} fill="#fff" filter={f("terre")} />
        <rect x={t} y={t} width={vw - 2 * t} height={vh - 2 * t} fill={f("ombreH")} />
        <rect x={t} y={t} width={vw - 2 * t} height={vh - 2 * t} fill={f("ombreV")} />

        {/* Cadre : deux planches longues (avant/arrière) et deux planches courtes (côtés) */}
        {[
          { x: 0, y: 0, w: vw, h: t, g: "gh" },
          { x: 0, y: vh - t, w: vw, h: t, g: "gh" },
          { x: 0, y: t, w: t, h: vh - 2 * t, g: "gv" },
          { x: vw - t, y: t, w: t, h: vh - 2 * t, g: "gv" },
        ].map((b, i) => (
          <g key={i}>
            <rect x={b.x} y={b.y} width={b.w} height={b.h} fill={planche} />
            <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="#fff" filter={f(b.g)} />
            <rect x={b.x} y={b.y} width={b.w} height={b.h} fill="none" stroke="#4a2c12" strokeOpacity="0.7" strokeWidth={0.6} />
          </g>
        ))}
      </svg>
      <div data-carre-soil={carreId} className="absolute" style={{ left: `${ix}%`, right: `${ix}%`, top: `${iy}%`, bottom: `${iy}%` }}>
        {children}
      </div>
    </div>
  );
}
