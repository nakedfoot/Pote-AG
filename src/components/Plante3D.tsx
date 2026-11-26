import type { ReactNode } from "react";
import type { TypePlante } from "@/lib/carres";

const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
const FLEURS = ["#ec4899", "#f59e0b", "#a855f7", "#ef4444", "#f8fafc", "#facc15"];

/** Ellipse de feuillage : [décalage x / L, centre y / H, rayon x / L, rayon y / H] */
type Blob = [number, number, number, number];
const BUISSON: Blob[] = [[-0.28, -0.3, 0.26, 0.3], [0.28, -0.3, 0.26, 0.3], [0, -0.42, 0.3, 0.36], [-0.17, -0.68, 0.24, 0.28], [0.18, -0.66, 0.24, 0.28], [0, -0.8, 0.2, 0.22]];
const CIME: Blob[] = [[-0.3, -0.62, 0.22, 0.17], [0.3, -0.62, 0.22, 0.17], [0, -0.7, 0.32, 0.24], [-0.18, -0.86, 0.24, 0.17], [0.2, -0.84, 0.24, 0.17], [0, -0.92, 0.2, 0.1]];

/**
 * Plante dessinée en SVG, vue de face, posée au point (x, y) — la base de la plante.
 * `hcm` : hauteur en cm, `s` : pixels par cm. Les dégradés (`leafL`, `leafD`, `trunk`) viennent du `<defs>` parent.
 */
export default function Plante3D({
  type, x, y, hcm, esp, s, id, uid,
}: {
  type: TypePlante; x: number; y: number; hcm: number; esp: number | null; s: number; id: number; uid: string;
}) {
  const H = Math.max(hcm * s, 6);
  const u = (n: string) => `url(#${n}${uid})`;
  const contour = { stroke: "#1f4d1a", strokeOpacity: 0.35, strokeWidth: 0.4 };
  const blobs = (list: Blob[], W: number) =>
    list.map(([dx, cy, rx, ry], i) => (
      <ellipse key={i} cx={dx * W} cy={cy * H} rx={rx * W} ry={ry * H} fill={u(i % 2 ? "leafD" : "leafL")} {...contour} />
    ));

  let W: number;
  let corps: ReactNode;

  if (type === "fleur") {
    W = Math.max(clamp(hcm * 0.35, 8, 25) * s, 5);
    const r = clamp(W * 0.45, 3, 14);
    const couleur = FLEURS[id % FLEURS.length];
    const tige = Math.max(1, W * 0.07);
    corps = (
      <>
        <line x1={0} y1={0} x2={0} y2={-H * 0.85} stroke="#3f7d2b" strokeWidth={tige} strokeLinecap="round" />
        <g transform={`translate(0 ${-H * 0.3}) rotate(-55)`}><ellipse cx={0} cy={-r * 0.9} rx={r * 0.35} ry={r * 0.9} fill={u("leafL")} {...contour} /></g>
        <g transform={`translate(0 ${-H * 0.5}) rotate(55)`}><ellipse cx={0} cy={-r * 0.9} rx={r * 0.35} ry={r * 0.9} fill={u("leafD")} {...contour} /></g>
        <g transform={`translate(0 ${-H * 0.88})`}>
          {Array.from({ length: 6 }, (_, k) => (
            <g key={k} transform={`rotate(${k * 60})`}>
              <ellipse cx={0} cy={-r * 0.55} rx={r * 0.4} ry={r * 0.6} fill={couleur} stroke="#000" strokeOpacity={0.25} strokeWidth={0.4} />
            </g>
          ))}
          <circle r={r * 0.32} fill="#f59e0b" stroke="#92400e" strokeOpacity={0.5} strokeWidth={0.4} />
        </g>
      </>
    );
  } else if (type === "arbuste") {
    W = Math.max(clamp(hcm * 0.9, 20, 120) * s, 10);
    corps = (
      <>
        <rect x={-W * 0.04} y={-H * 0.25} width={W * 0.08} height={H * 0.25} fill={u("trunk")} />
        {blobs(BUISSON, W)}
        {[[-0.1, -0.55], [0.15, -0.4], [-0.2, -0.75]].map(([dx, cy], i) => (
          <ellipse key={i} cx={dx * W} cy={cy * H} rx={W * 0.07} ry={H * 0.05} fill="#a3e06a" opacity={0.45} />
        ))}
      </>
    );
  } else if (type === "arbre") {
    W = Math.max(clamp(hcm * 0.55, 40, 200) * s, 12);
    const tw = Math.max(2.5, W * 0.12);
    corps = (
      <>
        <polygon points={`${-tw / 2},0 ${tw / 2},0 ${tw * 0.35},${-H * 0.62} ${-tw * 0.35},${-H * 0.62}`} fill={u("trunk")} stroke="#2f1d0e" strokeOpacity={0.5} strokeWidth={0.5} />
        {blobs(CIME, W)}
      </>
    );
  } else if (type === "grimpante") {
    W = Math.max(16 * s, 8);
    const pts = Array.from({ length: 13 }, (_, i) => [Math.sin(i * 1.2) * W * 0.35, -(H * i) / 12] as const);
    corps = (
      <>
        <line x1={0} y1={0} x2={0} y2={-H} stroke="#7a5230" strokeWidth={Math.max(1, W * 0.07)} strokeLinecap="round" />
        <polyline points={pts.map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`).join(" ")} fill="none" stroke="#3f7d2b" strokeWidth={Math.max(0.8, W * 0.05)} strokeLinejoin="round" />
        {pts.slice(1).map(([px, py], i) => (
          <g key={i} transform={`translate(${px} ${py}) rotate(${i % 2 ? 40 : -40})`}>
            <ellipse cx={0} cy={-W * 0.1} rx={W * 0.1} ry={W * 0.17} fill={u(i % 2 ? "leafD" : "leafL")} {...contour} />
          </g>
        ))}
      </>
    );
  } else {
    // Légume, aromatique, herbacée : touffe de feuilles
    W = Math.max(clamp(esp ?? Math.max(15, hcm * 0.7), 10, 50) * 0.8 * s, 7);
    const n = 7;
    corps = Array.from({ length: n }, (_, i) => {
      const f = i / (n - 1);
      const ang = -55 + 110 * f + (((id + i) % 3) - 1) * 6;
      const len = H * (0.65 + 0.35 * Math.sin(Math.PI * f));
      return (
        <g key={i} transform={`rotate(${ang})`}>
          <ellipse cx={0} cy={-len / 2} rx={Math.max(1.5, W * 0.13)} ry={len / 2} fill={u(i % 2 ? "leafD" : "leafL")} {...contour} />
        </g>
      );
    });
  }

  return (
    <g transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}>
      <ellipse cx={0} cy={0.5} rx={W * 0.5} ry={W * 0.16} fill="#000" opacity={0.35} />
      {corps}
    </g>
  );
}
