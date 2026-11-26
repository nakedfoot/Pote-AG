import { useId } from "react";
import { PIED_HAUTEUR_CM, PIED_SECTION_CM } from "@/lib/carres";

const W = 240, H = 160;
const PAD = { l: 30, r: 34, t: 10, b: 22 };
const KX = 0.5, KY = 0.32; // inclinaison de la largeur (projection oblique)
const PLANCHE_CM = 15; // hauteur d'une planche, pour le dessin du bois
const EPAISSEUR_CM = 2.1; // épaisseur des planches du cadre

const cm = (n: number) => `${Number(n.toFixed(1))} cm`;
type Pt = [number, number];
const poly = (pts: Pt[]) => pts.map((p) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(" ");

/**
 * Carré potager en bois vu en perspective, à l'échelle : longueur (face avant), largeur (profondeur)
 * et hauteur du cadre. Rendu réaliste en SVG pur (veinures du bois, terre, ombre portée, herbe).
 * Composant sans état, prévu pour être réutilisé (ex. vue potager).
 */
export default function CarreGraphic({
  longueur, largeur, hauteur, pieds = false, className = "w-full",
}: {
  longueur: number | null; largeur: number | null; hauteur: number | null; pieds?: boolean; className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  if (!longueur || !largeur) {
    return (
      <div className={`flex items-center justify-center rounded-lg bg-black/5 text-center text-xs text-muted dark:bg-white/5 ${className}`} style={{ aspectRatio: `${W} / ${H}` }}>
        Longueur et largeur à renseigner
      </div>
    );
  }
  const h = hauteur ?? 0;
  const lp = pieds ? PIED_HAUTEUR_CM : 0; // hauteur des pieds
  const ext = { x: longueur + largeur * KX, y: h + lp + largeur * KY };
  const aw = W - PAD.l - PAD.r, ah = H - PAD.t - PAD.b;
  const s = Math.min(aw / ext.x, ah / ext.y);
  const x0 = PAD.l + (aw - ext.x * s) / 2;
  const yg = PAD.t + (ah + ext.y * s) / 2; // sol, devant
  const L = longueur * s, D = largeur * s, Hh = h * s, Lp = lp * s;
  const yb = yg - Lp; // bas de la face avant du cadre
  const dx = D * KX, dy = D * KY;
  const yt = yb - Hh; // niveau du dessus du cadre

  // Point sur le plan du dessus : u le long de la longueur, v en profondeur (en px)
  const top = (u: number, v: number): Pt => [x0 + u + v * KX, yt - v * KY];

  // Épaisseur du cadre (≈ 3 cm), terre légèrement en contrebas
  // t : épaisseur des planches (2,1 cm, à l'échelle) mesurée sur la longueur. Les rebords gauche/droite sont
  // inclinés par la perspective : leur épaisseur perpendiculaire vaut t·sin(θ). En profondeur (v), on choisit tv pour
  // que les rebords avant/arrière aient exactement la même épaisseur apparente (tv·KY = t·sin(θ) → tv = t / |(KX, KY)|).
  const t = Math.min(Math.max(EPAISSEUR_CM * s, 1.2), L / 4, D / 6);
  const tv = t / Math.hypot(KX, KY);
  const creux = h > 0 ? Math.min(Hh * 0.25, 7) : 0;
  const soil = (pts: Pt[]) => pts.map(([x, y]) => [x, y + creux] as Pt);

  const front: Pt[] = [[x0, yb], [x0 + L, yb], [x0 + L, yt], [x0, yt]];
  const side: Pt[] = [[x0 + L, yb], [x0 + L + dx, yb - dy], [x0 + L + dx, yt - dy], [x0 + L, yt]];
  const rim: Pt[] = [top(0, 0), top(L, 0), top(L, D), top(0, D)];
  const inner: Pt[] = [top(t, tv), top(L - t, tv), top(L - t, D - tv), top(t, D - tv)];
  const terre = soil(inner);
  const paroiFond: Pt[] = [inner[3], inner[2], terre[2], terre[3]]; // face intérieure de la planche du fond
  const paroiGauche: Pt[] = [inner[0], inner[3], terre[3], terre[0]];

  // Joints entre planches
  const n = h > 0 ? Math.min(8, Math.max(1, Math.round(h / PLANCHE_CM))) : 0;
  const joints = Array.from({ length: n - 1 }, (_, i) => (i + 1) / n);

  const ombre: Pt[] = [[x0 + 4, yg + 2], [x0 + L + 4, yg + 2], [x0 + L + dx + 7, yg - dy + 3], [x0 + dx + 6, yg - dy + 3]];

  // Pieds : quatre poteaux carrés aux coins, du fond vers l'avant
  const a = Math.min(Math.max(PIED_SECTION_CM * s, 2), L / 3, D / 3);
  const sol = (u: number, v: number): Pt => [x0 + u + v * KX, yg - v * KY];
  const poteaux = pieds
    ? [[0, D - a], [L - a, D - a], [0, 0], [L - a, 0]].map(([u, v]) => {
        const p0 = sol(u, v), p1 = sol(u + a, v), p2 = sol(u + a, v + a);
        const up = (p: Pt): Pt => [p[0], p[1] - Lp];
        return { avant: [p0, p1, up(p1), up(p0)] as Pt[], droite: [p1, p2, up(p2), up(p1)] as Pt[] };
      })
    : [];
  const f = (name: string) => `url(#${name}${uid})`;
  const label = "fill-muted text-[10px]";

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} role="img" aria-label={`Carré de ${cm(longueur)} sur ${cm(largeur)}${hauteur ? `, hauteur ${cm(hauteur)}` : ""}`}>
      <defs>
        {/* Veinures du bois : bruit étiré horizontalement */}
        <filter id={`grain${uid}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.012 0.55" numOctaves="3" seed="7" result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.18  0 0 0 0 0.09  0 0 0 0 0.03  1.5 0 0 0 -0.4" result="c" />
          <feComposite in="c" in2="SourceAlpha" operator="in" />
        </filter>
        {/* Terre : grain fin brun, opaque */}
        <filter id={`terre${uid}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="3" seed="11" result="n" />
          <feColorMatrix in="n" type="matrix" values="0.5 0 0 0 0.04  0.34 0 0 0 0.025  0.21 0 0 0 0.012  0 0 0 0 1" result="c" />
          <feComposite in="c" in2="SourceAlpha" operator="in" />
        </filter>
        {/* Herbe */}
        <filter id={`herbe${uid}`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.7 0.5" numOctaves="2" seed="4" result="n" />
          <feColorMatrix in="n" type="matrix" values="0.3 0 0 0 0.06  0.55 0 0 0 0.2  0.2 0 0 0 0.04  0 0 0 0 1" result="c" />
          <feComposite in="c" in2="SourceAlpha" operator="in" />
        </filter>
        <filter id={`flou${uid}`} x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="2.5" /></filter>
        <linearGradient id={`bois${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d9a566" /><stop offset="1" stopColor="#b97f45" />
        </linearGradient>
        <linearGradient id={`boisCote${uid}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#a8703a" /><stop offset="1" stopColor="#80522a" />
        </linearGradient>
        <linearGradient id={`dessus${uid}`} x1="0" y1="1" x2="1" y2="0">
          <stop offset="0" stopColor="#e6b97b" /><stop offset="1" stopColor="#c58d52" />
        </linearGradient>
        <linearGradient id={`ombreTerre${uid}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#000" stopOpacity="0" /><stop offset="1" stopColor="#000" stopOpacity="0.45" />
        </linearGradient>
        <radialGradient id={`sol${uid}`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#6aa84f" stopOpacity="0.55" /><stop offset="1" stopColor="#6aa84f" stopOpacity="0" />
        </radialGradient>
        <clipPath id={`ouv${uid}`}><polygon points={poly(inner)} /></clipPath>
        <clipPath id={`clipHerbe${uid}`}><rect x="0" y="0" width={W} height={H} /></clipPath>
      </defs>

      {/* Sol herbeux et ombre portée */}
      <g clipPath={`url(#clipHerbe${uid})`}>
        <ellipse cx={x0 + (L + dx) / 2} cy={yg - dy / 2 + 2} rx={Math.min(W / 2, (L + dx) / 2 + 28)} ry={Math.min(H / 2, dy / 2 + 22)} fill={`url(#sol${uid})`} />
        <ellipse cx={x0 + (L + dx) / 2} cy={yg - dy / 2 + 2} rx={Math.min(W / 2, (L + dx) / 2 + 28)} ry={Math.min(H / 2, dy / 2 + 22)} fill="#fff" filter={f("herbe")} opacity="0.35" />
      </g>
      <polygon points={poly(ombre)} fill="#000" opacity="0.4" filter={f("flou")} />

      {poteaux.map((p, i) => (
        <g key={i}>
          <polygon points={poly(p.avant)} fill="#b98348" />
          <polygon points={poly(p.avant)} fill="#fff" filter={f("grain")} />
          <polygon points={poly(p.droite)} fill="#7d4f27" />
          <polygon points={poly(p.droite)} fill="#fff" filter={f("grain")} />
          <polygon points={poly(p.avant)} fill="none" stroke="#3a210d" strokeOpacity="0.7" strokeWidth={0.7} strokeLinejoin="round" />
          <polygon points={poly(p.droite)} fill="none" stroke="#3a210d" strokeOpacity="0.7" strokeWidth={0.7} strokeLinejoin="round" />
        </g>
      ))}

      {h > 0 && (
        <>
          {/* Face avant */}
          <polygon points={poly(front)} fill={f("bois")} />
          <polygon points={poly(front)} fill="#fff" filter={f("grain")} />
          {joints.map((j, i) => (
            <line key={i} x1={x0} x2={x0 + L} y1={yb - Hh * j} y2={yb - Hh * j} stroke="#4a2c12" strokeOpacity="0.75" strokeWidth={0.9} />
          ))}
          <line x1={x0} x2={x0 + L} y1={yt + 0.5} y2={yt + 0.5} stroke="#fff" strokeOpacity="0.35" strokeWidth={0.8} />
          {/* Face droite, dans l'ombre */}
          <polygon points={poly(side)} fill={f("boisCote")} />
          <polygon points={poly(side)} fill="#fff" filter={f("grain")} />
          {joints.map((j, i) => (
            <line key={i} x1={x0 + L} x2={x0 + L + dx} y1={yb - Hh * j} y2={yb - dy - Hh * j} stroke="#3a210d" strokeOpacity="0.8" strokeWidth={0.9} />
          ))}
          <polygon points={poly(side)} fill="#000" opacity="0.08" />
          <polygon points={poly(front)} fill="none" stroke="#4a2c12" strokeOpacity="0.6" strokeWidth={0.8} strokeLinejoin="round" />
          <polygon points={poly(side)} fill="none" stroke="#3a210d" strokeOpacity="0.6" strokeWidth={0.8} strokeLinejoin="round" />
        </>
      )}

      {/* Dessus : rebord en bois, puis terre en contrebas */}
      <polygon points={poly(rim)} fill={f("dessus")} />
      <polygon points={poly(rim)} fill="#fff" filter={f("grain")} />
      <polygon points={poly(rim)} fill="none" stroke="#4a2c12" strokeOpacity="0.6" strokeWidth={0.8} strokeLinejoin="round" />
      <polygon points={poly(inner)} fill="#2a1a0e" />
      {/* Tout l'intérieur est rogné à l'ouverture : la terre, en contrebas, ne recouvre jamais les rebords avant et droit */}
      <g clipPath={f("ouv")}>
      <polygon points={poly(terre)} fill="#fff" filter={f("terre")} />
      {/* Parois intérieures visibles */}
      {creux > 0 && (
        <>
          <polygon points={poly(paroiFond)} fill="#7a4d27" />
          <polygon points={poly(paroiGauche)} fill="#8d5a2e" />
        </>
      )}
      {/* Ombre des parois sur la terre */}
      <polygon points={poly(terre)} fill={`url(#ombreTerre${uid})`} />
      <polygon points={poly(terre)} fill="none" stroke="#1a0f06" strokeOpacity="0.5" strokeWidth={0.6} />
      </g>

      {/* Cotes */}
      <text x={x0 + L / 2} y={yg + 14} textAnchor="middle" className={label}>{cm(longueur)}</text>
      <text x={x0 + L + dx + 4} y={yt - dy / 2 + 3} className={label}>{cm(largeur)}</text>
      {h > 0 && <text x={x0 - 4} y={yb - Hh / 2 + 3} textAnchor="end" className={label}>{cm(h)}</text>}
    </svg>
  );
}
