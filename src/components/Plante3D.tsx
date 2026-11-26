import type { ReactNode } from "react";
import type { TypePlante } from "@/lib/carres";

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const FLEURS = ["#ec4899", "#f59e0b", "#a855f7", "#ef4444", "#f8fafc", "#facc15"];
/** Verts du plus clair (0) au plus sombre (5) */
const VERTS = ["#a6e06b", "#86ca4f", "#64b23c", "#489834", "#337d29", "#23631f"];
/** Feuille pointue de longueur 1, base en (0,0), pointe vers le haut */
const FEUILLE = "M0,0 C0.32,-0.18 0.34,-0.7 0,-1 C-0.34,-0.7 -0.32,-0.18 0,0Z";

/** Générateur pseudo-aléatoire déterministe (mulberry32) : une même plante garde toujours le même feuillage. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const feuille = (x: number, y: number, angle: number, taille: number, fill: string, key: number) => (
  <path key={key} d={FEUILLE} fill={fill} transform={`translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${angle.toFixed(0)}) scale(${(taille * 0.62).toFixed(2)} ${taille.toFixed(2)})`} />
);

/**
 * Feuillage dense : un grand nombre de petites feuilles réparties dans une ellipse, orientées vers l'extérieur.
 * Les feuilles claires (en haut à gauche, face à la lumière) sont dessinées par-dessus les sombres.
 */
function Feuillage({ cx, cy, rx, ry, yMax, H, rand }: { cx: number; cy: number; rx: number; ry: number; yMax: number; H: number; rand: () => number }) {
  const len = clamp(H * 0.075, 2.2, 6.5);
  const n = Math.round(clamp((Math.PI * rx * ry) / (len * len * 0.15), 40, 280));
  const feuilles = Array.from({ length: n }, () => {
    const r = Math.sqrt(rand());
    const th = rand() * Math.PI * 2;
    const px = Math.cos(th) * r;
    const py = Math.sin(th) * r; // négatif = vers le haut
    const x = cx + px * rx;
    const y = Math.min(cy + py * ry, yMax - rand() * len * 0.6);
    const ombre = clamp(0.5 + 0.32 * py + 0.14 * px + (rand() - 0.5) * 0.45, 0, 1);
    const angle = (Math.atan2(px, -py) * 180) / Math.PI + (rand() - 0.5) * 110;
    return { x, y, angle, ombre: Math.round(ombre * 5), taille: len * (0.8 + rand() * 0.6) };
  });
  feuilles.sort((a, b) => b.ombre - a.ombre);
  return (
    <>
      <ellipse cx={cx} cy={Math.min(cy, yMax - ry * 0.0)} rx={rx * 0.9} ry={ry * 0.88} fill={VERTS[4]} />
      {feuilles.map((f, i) => feuille(f.x, f.y, f.angle, f.taille, VERTS[f.ombre], i))}
    </>
  );
}

/**
 * Plante dessinée en SVG, vue de face, posée au point (x, y) — la base de la plante.
 * `hcm` : hauteur en cm, `s` : pixels par cm. Les proportions (largeur / hauteur) suivent la forme de la plante :
 * une plante de 15 cm reste une petite plante, jamais un arbre aplati. Les dégradés `leafL`, `leafD` et `trunk`
 * viennent du `<defs>` parent.
 */
export default function Plante3D({
  type, x, y, hcm, esp, s, id, uid,
}: {
  type: TypePlante; x: number; y: number; hcm: number; esp: number | null; s: number; id: number; uid: string;
}) {
  const H = Math.max(hcm * s, 6);
  const u = (n: string) => `url(#${n}${uid})`;
  const rand = rng(id * 7919 + type.length * 31);
  let W: number;
  let corps: ReactNode;

  if (type === "arbre") {
    // Tronc évasé à la base, branches, grande couronne (≈ 0,7 × la hauteur)
    const rx = H * 0.36, ry = H * 0.3, cy = -H * 0.71;
    W = rx * 2;
    const tw = Math.max(2, H * 0.07);
    const br = Math.max(1, tw * 0.45);
    corps = (
      <>
        <polygon
          points={`${-tw * 0.95},0 ${-tw * 0.5},${-H * 0.12} ${-tw * 0.32},${-H * 0.46} ${tw * 0.32},${-H * 0.46} ${tw * 0.5},${-H * 0.12} ${tw * 0.95},0`}
          fill={u("trunk")} stroke="#2f1d0e" strokeOpacity={0.5} strokeWidth={0.5}
        />
        {[[-0.6, -0.62], [0.6, -0.64], [0, -0.78], [-0.3, -0.5], [0.32, -0.52]].map(([dx, dy], i) => (
          <line key={i} x1={0} y1={-H * 0.4} x2={dx * rx} y2={dy * H} stroke="#4e331c" strokeWidth={br} strokeLinecap="round" />
        ))}
        <Feuillage cx={0} cy={cy} rx={rx} ry={ry} yMax={-H * 0.38} H={H} rand={rand} />
      </>
    );
  } else if (type === "arbuste") {
    // Buisson touffu, plusieurs tiges à la base
    const rx = H * 0.45, ry = H * 0.48;
    W = rx * 2;
    corps = (
      <>
        {[-0.5, -0.17, 0.17, 0.5].map((dx, i) => (
          <line key={i} x1={dx * rx * 0.2} y1={0} x2={dx * rx * 0.9} y2={-H * 0.4} stroke="#5a3b1f" strokeWidth={Math.max(1, H * 0.025)} strokeLinecap="round" />
        ))}
        <Feuillage cx={0} cy={-H * 0.52} rx={rx} ry={ry} yMax={-H * 0.05} H={H} rand={rand} />
      </>
    );
  } else if (type === "fleur") {
    W = Math.max(H * 0.35, 5);
    const r = clamp(H * 0.13, 2.5, 14);
    const couleur = FLEURS[id % FLEURS.length];
    const taille = clamp(H * 0.2, 3, 12);
    corps = (
      <>
        <line x1={0} y1={0} x2={0} y2={-H * 0.86} stroke="#3f7d2b" strokeWidth={Math.max(1, H * 0.035)} strokeLinecap="round" />
        {[[-0.18, -60], [-0.34, 55], [-0.5, -50], [-0.62, 60]].map(([hy, a], i) => feuille(0, hy * H, a, taille, VERTS[2 + (i % 2)], i))}
        <g transform={`translate(0 ${-H * 0.88})`}>
          {Array.from({ length: 7 }, (_, k) => (
            <g key={k} transform={`rotate(${k * (360 / 7)})`}>
              <ellipse cx={0} cy={-r * 0.58} rx={r * 0.38} ry={r * 0.62} fill={couleur} stroke="#000" strokeOpacity={0.22} strokeWidth={0.4} />
            </g>
          ))}
          <circle r={r * 0.32} fill="#f59e0b" stroke="#92400e" strokeOpacity={0.5} strokeWidth={0.4} />
        </g>
      </>
    );
  } else if (type === "grimpante") {
    W = Math.max(H * 0.3, 8);
    const taille = clamp(H * 0.07, 2.5, 9);
    const pts = Array.from({ length: 15 }, (_, i) => [Math.sin(i * 1.15) * W * 0.32, -(H * i) / 14] as const);
    corps = (
      <>
        <line x1={0} y1={0} x2={0} y2={-H} stroke="#7a5230" strokeWidth={Math.max(1, H * 0.025)} strokeLinecap="round" />
        <polyline points={pts.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(" ")} fill="none" stroke="#3f7d2b" strokeWidth={Math.max(0.8, H * 0.02)} strokeLinejoin="round" />
        {pts.slice(1).flatMap(([px, py], i) => [
          feuille(px, py, i % 2 ? 55 : -55, taille * (0.85 + rand() * 0.4), VERTS[1 + Math.floor(rand() * 3)], i * 2),
          feuille(px, py + taille * 0.2, i % 2 ? -110 : 110, taille * (0.7 + rand() * 0.4), VERTS[2 + Math.floor(rand() * 3)], i * 2 + 1),
        ])}
      </>
    );
  } else {
    // Légume, aromatique, herbacée : touffe de feuilles ; la largeur suit l'espacement mais reste proportionnée à la hauteur
    const wcm = clamp((esp ?? hcm * 0.9) * 0.8, hcm * 0.55, hcm * 1.3);
    W = Math.max(wcm * s, 7);
    const n = 11;
    const maxAng = clamp((Math.atan((W * 0.5) / (H * 0.7)) * 180) / Math.PI, 18, 70);
    corps = Array.from({ length: n }, (_, i) => {
      const f = i / (n - 1);
      const ang = -maxAng + 2 * maxAng * f + (rand() - 0.5) * 10;
      const len = H * (0.55 + 0.45 * Math.sin(Math.PI * f) * (0.8 + rand() * 0.3));
      return (
        <g key={i} transform={`rotate(${ang.toFixed(0)})`}>
          <path d={FEUILLE} fill={u(i % 2 ? "leafD" : "leafL")} stroke="#1f4d1a" strokeOpacity={0.3} strokeWidth={0.04} transform={`scale(${(Math.max(1.5, len * 0.3)).toFixed(2)} ${len.toFixed(2)})`} />
        </g>
      );
    });
  }

  return (
    <g transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}>
      <ellipse cx={0} cy={0.5} rx={W * 0.45} ry={W * 0.15} fill="#000" opacity={0.35} />
      {corps}
    </g>
  );
}
