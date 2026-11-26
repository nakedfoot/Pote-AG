import type { ReactNode } from "react";
import type { TypePlante } from "@/lib/carres";

export const clamp = (n: number, a: number, b: number) => Math.min(b, Math.max(a, n));
/** Verts du plus clair (0) au plus sombre (5) */
export const VERTS = ["#a6e06b", "#86ca4f", "#64b23c", "#489834", "#337d29", "#23631f"];

/** Contexte de dessin d'une plante : H = hauteur en px, hcm = hauteur en cm, esp = espacement en cm, s = px par cm. */
export type Ctx = {
  H: number; hcm: number; esp: number | null; s: number; rand: () => number;
  u: (nom: string) => string; fruit: string | null; fleurs: string | null;
};
export type Modele = (c: Ctx) => { W: number; corps: ReactNode };

const f = (n: number) => n.toFixed(2);
const sin = Math.sin, cos = Math.cos;
const deg = (r: number) => (r * 180) / Math.PI;
const ligne = (key: string | number, x1: number, y1: number, x2: number, y2: number, stroke: string, w: number, op = 1) => (
  <line key={key} x1={f(x1)} y1={f(y1)} x2={f(x2)} y2={f(y2)} stroke={stroke} strokeWidth={f(w)} strokeLinecap="round" opacity={op} />
);
/** Contour d'une feuille lobée (k lobes) de rayon R, centrée en (0,0) */
function lobes(R: number, k: number, pas = 48): string {
  const pts = Array.from({ length: pas }, (_, i) => {
    const t = (i / pas) * Math.PI * 2;
    const r = R * (0.55 + 0.45 * Math.abs(cos((k * t) / 2)));
    return `${f(sin(t) * r)},${f(-cos(t) * r)}`;
  });
  return `M${pts.join("L")}Z`;
}
const tracer = (pts: [number, number][]) => pts.map(([x, y]) => `${f(x)},${f(y)}`).join(" ");

/** Fleur à cinq pétales */
const fleur5 = (key: string | number, x: number, y: number, r: number, couleur: string, coeur = "#f5c52e") => (
  <g key={key} transform={`translate(${f(x)} ${f(y)})`}>
    {Array.from({ length: 5 }, (_, k) => (
      <circle key={k} cx={f(cos((k * 2 * Math.PI) / 5) * r * 0.6)} cy={f(sin((k * 2 * Math.PI) / 5) * r * 0.6)} r={f(r * 0.5)} fill={couleur} stroke="#000" strokeOpacity={0.2} strokeWidth={0.25} />
    ))}
    <circle r={f(r * 0.3)} fill={coeur} />
  </g>
);

/** Feuille composée : rachis de longueur L (le repère est tourné pour que « haut » suive la feuille), folioles par paires */
const composee = (key: string | number, x: number, y: number, angleDeg: number, L: number, paires: number, fl: number, fills: [string, string]) => (
  <g key={key} transform={`translate(${f(x)} ${f(y)}) rotate(${f(angleDeg)})`}>
    <line x1={0} y1={0} x2={0} y2={f(-L)} stroke="#4f8a34" strokeWidth={f(Math.max(0.4, L * 0.03))} />
    {Array.from({ length: paires }, (_, k) => {
      const t = 0.3 + (0.6 * k) / Math.max(1, paires - 1 || 1);
      const cy = -L * (paires === 1 ? 0.5 : t);
      return [-1, 1].map((sd) => (
        <ellipse key={`${k}${sd}`} cx={f(sd * fl * 0.55)} cy={f(cy)} rx={f(fl * 0.3)} ry={f(fl * 0.5)} transform={`rotate(${sd * 38} ${f(sd * fl * 0.55)} ${f(cy)})`} fill={fills[k % 2]} stroke="#1f4d1a" strokeOpacity={0.4} strokeWidth={0.3} />
      ));
    })}
    <ellipse cx={0} cy={f(-L - fl * 0.2)} rx={f(fl * 0.34)} ry={f(fl * 0.56)} fill={fills[0]} stroke="#1f4d1a" strokeOpacity={0.4} strokeWidth={0.3} />
  </g>
);

export const MODELES: Partial<Record<TypePlante, Modele>> = {
  // Oignon, ail, poireau : bulbe doré à la base, feuilles creuses dressées
  oignon: ({ H, hcm, esp, s, rand }) => {
    const W = Math.max(clamp(esp ?? 10, hcm * 0.25, hcm * 0.6) * s * 0.9, 5);
    const bulbe = clamp(H * 0.11, 1.4, 7);
    const n = 10;
    const bw = Math.max(0.9, H * 0.032);
    const feuilles = Array.from({ length: n }, (_, i) => {
      const a = (i / (n - 1)) * 2 - 1;
      const len = H * (0.62 + 0.38 * rand());
      const tx = a * W * 0.5 + (rand() - 0.5) * W * 0.15;
      const d = `M${f(a * bulbe * 0.4)},${f(-bulbe * 1.3)} Q${f(tx * 0.35 + (rand() - 0.5) * W * 0.1)},${f(-len * 0.55)} ${f(tx)},${f(-len)}`;
      return (
        <g key={i}>
          <path d={d} fill="none" stroke="#3f8f33" strokeWidth={f(bw)} strokeLinecap="round" />
          <path d={d} fill="none" stroke="#9bd66a" strokeWidth={f(bw * 0.3)} strokeLinecap="round" opacity={0.8} />
        </g>
      );
    });
    return {
      W,
      corps: (
        <>
          {feuilles}
          <ellipse cx={0} cy={f(-bulbe * 0.6)} rx={f(bulbe)} ry={f(bulbe * 0.85)} fill="#d9a441" stroke="#8a5a1a" strokeOpacity={0.7} strokeWidth={0.4} />
          <ellipse cx={f(-bulbe * 0.3)} cy={f(-bulbe * 0.9)} rx={f(bulbe * 0.3)} ry={f(bulbe * 0.45)} fill="#fff" opacity={0.3} />
          <path d={`M${f(-bulbe * 0.25)},${f(-bulbe * 1.3)} L0,${f(-bulbe * 1.7)} L${f(bulbe * 0.25)},${f(-bulbe * 1.3)}Z`} fill="#c9a85a" />
        </>
      ),
    };
  },

  // Ciboulette : touffe dense de tubes fins, boules de fleurs roses
  ciboulette: ({ H, hcm, esp, s, rand, fleurs }) => {
    const W = Math.max(clamp(esp ?? 15, hcm * 0.4, hcm * 0.9) * s, 6);
    const n = 26;
    const bw = Math.max(0.5, H * 0.017);
    const brins = Array.from({ length: n }, (_, i) => {
      const a = (i / (n - 1)) * 2 - 1;
      const len = H * (0.55 + 0.4 * rand());
      const tx = a * W * 0.55;
      return <path key={i} d={`M${f(a * W * 0.08)},0 Q${f(tx * 0.3)},${f(-len * 0.6)} ${f(tx)},${f(-len)}`} fill="none" stroke={i % 3 ? "#3f8f33" : "#5aa845"} strokeWidth={f(bw)} strokeLinecap="round" />;
    });
    const r = clamp(H * 0.085, 1.4, 5);
    const boules = fleurs
      ? [-0.25, 0.06, 0.3].map((dx, i) => {
          const fx = dx * W, fy = -H * (0.92 + 0.08 * (i % 2));
          return (
            <g key={`b${i}`}>
              <line x1={f(dx * W * 0.2)} y1={f(-H * 0.1)} x2={f(fx)} y2={f(fy)} stroke="#4f8a34" strokeWidth={f(Math.max(0.6, H * 0.02))} />
              <g transform={`translate(${f(fx)} ${f(fy)})`}>
                {Array.from({ length: 16 }, (_, k) => {
                  const rr = Math.sqrt(rand()) * r, t = rand() * Math.PI * 2;
                  return <circle key={k} cx={f(cos(t) * rr)} cy={f(sin(t) * rr)} r={f(r * 0.3)} fill={fleurs} stroke="#000" strokeOpacity={0.12} strokeWidth={0.2} />;
                })}
              </g>
            </g>
          );
        })
      : null;
    return { W, corps: <>{brins}{boules}</> };
  },

  // Romarin : tiges ligneuses dressées couvertes d'aiguilles, petites fleurs bleues
  romarin: ({ H, hcm, esp, s, rand, fleurs }) => {
    const W = Math.max(clamp((esp ?? 60) * 0.8, hcm * 0.5, hcm * 0.9) * s, 8);
    const nt = 8;
    const aig = Math.max(0.5, H * 0.013);
    const ln = H * 0.085;
    const tiges = Array.from({ length: nt }, (_, i) => {
      const a = ((i / (nt - 1)) * 2 - 1) * 0.55 + (rand() - 0.5) * 0.15;
      const len = H * (0.75 + 0.25 * rand());
      const pts: [number, number][] = Array.from({ length: 13 }, (_, j) => {
        const t = j / 12;
        return [sin(a) * len * t + sin(t * 4 + i) * W * 0.015, -cos(a) * len * t];
      });
      const aiguilles = pts.slice(3).flatMap(([x, y], j) =>
        [-1, 1].flatMap((sd) =>
          [0, 1].map((k) => {
            const d = a + sd * (0.8 + rand() * 0.35 + k * 0.25), l = ln * (1 - (j / 12) * 0.3) * (1 - k * 0.2);
            const y2 = y + k * (len / 12) * 0.5;
            return ligne(`${i}a${j}${sd}${k}`, x, y2, x + sin(d) * l, y2 - cos(d) * l, (j + sd + k) % 2 ? "#4d7a45" : "#7ea36c", aig * 1.25);
          }),
        ),
      );
      return (
        <g key={i}>
          <polyline points={tracer(pts.slice(0, 5))} fill="none" stroke="#7a5a3a" strokeWidth={f(Math.max(0.8, H * 0.025))} strokeLinecap="round" />
          <polyline points={tracer(pts.slice(4))} fill="none" stroke="#6f8a52" strokeWidth={f(Math.max(0.6, H * 0.018))} strokeLinecap="round" />
          {aiguilles}
          {fleurs && pts.slice(7).map(([x, y], j) => (
            <circle key={`f${j}`} cx={f(x + (rand() - 0.5) * ln * 0.6)} cy={f(y + (rand() - 0.5) * ln * 0.6)} r={f(Math.max(0.7, H * 0.02))} fill={fleurs} stroke="#fff" strokeOpacity={0.5} strokeWidth={0.2} />
          ))}
        </g>
      );
    });
    return { W, corps: <>{tiges}</> };
  },

  // Thym, origan : petit dôme dense de minuscules feuilles sur des tiges ligneuses, fleurs roses
  thym: ({ H, hcm, esp, s, rand, fleurs }) => {
    const W = Math.max(clamp(esp ?? 30, hcm * 1.2, hcm * 3) * s, 8);
    const base = Array.from({ length: 9 }, (_, i) => {
      const t = ((i / 8) * 2 - 1) * 1.3;
      return ligne(`t${i}`, 0, 0, sin(t) * W * 0.42, -cos(t) * H * 0.7, "#7a5a3a", Math.max(0.6, H * 0.03));
    });
    const teintes = ["#6f8f4a", "#8aa85b", "#5a7a3c"];
    const rx = Math.max(0.55, H * 0.04);
    const feuilles = Array.from({ length: 170 }, (_, i) => {
      const phi = rand() * Math.PI, r = Math.sqrt(0.15 + 0.85 * rand());
      const x = cos(phi) * r * W * 0.5, y = -sin(phi) * r * H;
      return <ellipse key={i} cx={f(x)} cy={f(y)} rx={f(rx)} ry={f(rx * 0.55)} transform={`rotate(${f(rand() * 180)} ${f(x)} ${f(y)})`} fill={teintes[i % 3]} stroke="#2f4a22" strokeOpacity={0.35} strokeWidth={0.2} />;
    });
    const fl = fleurs
      ? Array.from({ length: 46 }, (_, i) => {
          const phi = rand() * Math.PI, r = 0.8 + 0.2 * rand();
          return <circle key={`f${i}`} cx={f(cos(phi) * r * W * 0.5)} cy={f(-sin(phi) * r * H)} r={f(Math.max(0.55, H * 0.028))} fill={fleurs} stroke="#fff" strokeOpacity={0.4} strokeWidth={0.15} />;
        })
      : null;
    return { W, corps: <>{base}{feuilles}{fl}</> };
  },

  // Persil, coriandre : rosette de pétioles portant des feuilles frisées à trois lobes
  persil: ({ H, hcm, esp, s, rand, u }) => {
    const W = Math.max(clamp(esp ?? 20, hcm * 0.9, hcm * 1.6) * s, 7);
    const n = 11, ls = H * 0.2;
    const feuilles = Array.from({ length: n }, (_, i) => {
      const a = -75 + 150 * (i / (n - 1)) + (rand() - 0.5) * 12;
      const len = H * (0.45 + 0.45 * rand());
      const tx = sin((a * Math.PI) / 180) * len * (W / H > 1.2 ? 1.4 : 1);
      const ty = -cos((a * Math.PI) / 180) * len * 0.92 - H * 0.05;
      const r0 = a * 0.5 + (rand() - 0.5) * 30;
      return (
        <g key={i}>
          <line x1={0} y1={0} x2={f(tx)} y2={f(ty)} stroke="#6fae45" strokeWidth={f(Math.max(0.6, H * 0.03))} strokeLinecap="round" />
          <g transform={`translate(${f(tx)} ${f(ty)})`}>
            <path d={lobes(ls, 3)} transform={`rotate(${f(r0)})`} fill={u(i % 2 ? "leafD" : "leafL")} stroke="#1f4d1a" strokeOpacity={0.45} strokeWidth={0.35} />
            <path d={lobes(ls * 0.6, 3)} transform={`translate(${f(ls * 0.15)} ${f(-ls * 0.1)}) rotate(${f(r0 + 60)})`} fill={VERTS[i % 3 + 1]} stroke="#1f4d1a" strokeOpacity={0.35} strokeWidth={0.3} />
          </g>
        </g>
      );
    });
    return { W, corps: <>{feuilles}</> };
  },

  // Estragon, basilic, menthe, sauge : tiges dressées garnies de feuilles lancéolées par paires
  estragon: ({ H, rand }) => {
    const W = Math.max(H * 0.5, 7);
    const nt = 7, ls = H * 0.15;
    const tiges = Array.from({ length: nt }, (_, i) => {
      const a = ((i / (nt - 1)) * 2 - 1) * 0.28 + (rand() - 0.5) * 0.1;
      const len = H * (0.8 + 0.2 * rand());
      const noeuds = Array.from({ length: 9 }, (_, j) => {
        const t = (j + 1) / 9, x = sin(a) * len * t, y = -cos(a) * len * t;
        return [-1, 1].map((sd) => (
          <path key={`${j}${sd}`} d="M0,0 C0.3,-0.2 0.28,-0.75 0,-1 C-0.28,-0.75 -0.3,-0.2 0,0Z" fill={VERTS[2 + ((i + j + (sd > 0 ? 1 : 0)) % 3)]} stroke="#1f4d1a" strokeOpacity={0.3} strokeWidth={0.04}
            transform={`translate(${f(x)} ${f(y)}) rotate(${f(deg(a) + sd * (48 + rand() * 12))}) scale(${f(ls * (1 - t * 0.35))} ${f(ls * (1 - t * 0.35) * 1.2)})`} />
        ));
      });
      return (
        <g key={i}>
          <line x1={0} y1={0} x2={f(sin(a) * len)} y2={f(-cos(a) * len)} stroke="#5a8f3a" strokeWidth={f(Math.max(0.6, H * 0.022))} strokeLinecap="round" />
          {noeuds}
          <path d="M0,0 C0.3,-0.2 0.28,-0.75 0,-1 C-0.28,-0.75 -0.3,-0.2 0,0Z" fill={VERTS[1]} transform={`translate(${f(sin(a) * len)} ${f(-cos(a) * len)}) rotate(${f(deg(a))}) scale(${f(ls * 0.5)} ${f(ls * 0.8)})`} />
        </g>
      );
    });
    return { W, corps: <>{tiges}</> };
  },

  // Laurier (sauce) : buisson dense de grandes feuilles lancéolées, vernissées, nervure centrale
  laurier: ({ H, rand }) => {
    const W = Math.max(H * 0.75, 8);
    const ls = H * 0.17;
    const troncs = Array.from({ length: 6 }, (_, i) => {
      const a = ((i / 5) * 2 - 1) * 0.35;
      return ligne(`t${i}`, 0, 0, sin(a) * H * 0.5, -cos(a) * H * 0.55, "#6b4a2a", Math.max(0.8, H * 0.03));
    });
    const feuilles = Array.from({ length: 150 }, (_, i) => {
      const x = (rand() * 2 - 1) * W * 0.5 * (0.35 + 0.65 * rand());
      const y = -H * (0.22 + 0.76 * rand());
      const lim = 1 - Math.abs(x) / (W * 0.5) * 0.45; // le buisson se rétrécit vers le haut
      const yy = y * lim;
      const ang = (x / (W * 0.5)) * 55 + (rand() - 0.5) * 55;
      const sz = ls * (0.75 + 0.5 * rand());
      return (
        <g key={i} transform={`translate(${f(x)} ${f(yy)}) rotate(${f(ang)})`}>
          <path d="M0,0 C0.34,-0.18 0.36,-0.7 0,-1 C-0.36,-0.7 -0.34,-0.18 0,0Z" fill={i % 3 ? "#2f7a3a" : "#3f8f3f"} stroke="#173d1a" strokeOpacity={0.5} strokeWidth={0.04} transform={`scale(${f(sz * 0.5)} ${f(sz)})`} />
          <line x1={0} y1={0} x2={0} y2={f(-sz * 0.9)} stroke="#a8d58f" strokeOpacity={0.55} strokeWidth={0.35} />
        </g>
      );
    });
    return { W, corps: <>{troncs}{feuilles}</> };
  },

  // Carotte, panais, radis : touffe de fanes très découpées, collet orange
  carotte: ({ H, hcm, esp, s, rand }) => {
    const W = Math.max(clamp((esp ?? 8) * 1.8, hcm * 0.4, hcm * 0.9) * s, 6);
    const n = 9;
    const maxA = clamp(Math.atan((W * 0.5) / (H * 0.7)), 0.2, 0.8);
    const sw = Math.max(0.45, H * 0.013);
    const fanes = Array.from({ length: n }, (_, i) => {
      const a = ((i / (n - 1)) * 2 - 1) * maxA + (rand() - 0.5) * 0.12;
      const len = H * (0.7 + 0.3 * rand());
      const pts: [number, number][] = Array.from({ length: 6 }, (_, j) => {
        const t = j / 5;
        return [sin(a) * len * t, -cos(a) * len * t];
      });
      const touffe = (key: string, x: number, y: number, dir: number, l: number, nb: number) =>
        Array.from({ length: nb }, (_, k) => {
          const d = dir + (nb === 1 ? 0 : (k / (nb - 1) - 0.5) * 0.9);
          return ligne(`${key}${k}`, x, y, x + sin(d) * l, y - cos(d) * l, (i + k) % 2 ? "#4f9a3a" : "#6fb94a", sw);
        });
      return (
        <g key={i}>
          <polyline points={tracer(pts)} fill="none" stroke="#5a9a3a" strokeWidth={f(Math.max(0.5, H * 0.02))} strokeLinecap="round" />
          {pts.slice(1, 5).flatMap(([x, y], j) => [-1, 1].flatMap((sd) => touffe(`l${j}${sd}`, x, y, a + sd * 0.85, H * 0.13 * (1 - j * 0.12), 3)))}
          {touffe("tip", pts[5][0], pts[5][1], a, H * 0.15, 5)}
        </g>
      );
    });
    return {
      W,
      corps: (
        <>
          {fanes}
          <ellipse cx={0} cy={0} rx={f(Math.max(1, H * 0.05))} ry={f(Math.max(0.5, H * 0.025))} fill="#e8791e" stroke="#9a4a0a" strokeOpacity={0.5} strokeWidth={0.3} />
        </>
      ),
    };
  },

  // Pomme de terre : touffe de tiges portant des feuilles composées à folioles ovales, fleurs mauves
  pomme_de_terre: ({ H, hcm, esp, s, rand }) => {
    const W = Math.max(clamp((esp ?? 35) * 0.9, hcm * 0.6, hcm * 1.1) * s, 8);
    const nt = 6, ls = H * 0.17;
    const tiges = Array.from({ length: nt }, (_, i) => {
      const a = ((i / (nt - 1)) * 2 - 1) * 0.5 + (rand() - 0.5) * 0.1;
      const len = H * (0.8 + 0.2 * rand());
      const pt = (t: number): [number, number] => [sin(a) * len * t, -cos(a) * len * t];
      const feuilles = [0.35, 0.55, 0.75, 0.95].map((t, j) => {
        const [x, y] = pt(t);
        const sd = (i + j) % 2 ? 1 : -1;
        return composee(`${i}l${j}`, x, y, deg(a) + sd * 62, ls * 1.6 * (1.1 - t * 0.35), 2, ls * 0.9, [VERTS[3], VERTS[4]]);
      });
      const [tx, ty] = pt(1);
      return (
        <g key={i}>
          <line x1={0} y1={0} x2={f(tx)} y2={f(ty)} stroke="#5a8f3a" strokeWidth={f(Math.max(0.7, H * 0.03))} strokeLinecap="round" />
          {feuilles}
          {i % 2 === 0 && fleur5(`f${i}`, tx, ty - ls * 0.2, clamp(H * 0.07, 1.4, 4.5), "#e6d4f5")}
        </g>
      );
    });
    return { W, corps: <>{tiges}</> };
  },

  // Tomate, aubergine, poivron : plant palissé sur un tuteur, feuilles composées, grappes de fruits
  tomate: ({ H, rand, fruit }) => {
    const W = Math.max(H * 0.45, 8);
    const couleur = fruit ?? "#d8321f";
    const ls = H * 0.17;
    const rt = clamp(H * 0.045, 1.3, 6);
    const pt = (t: number): [number, number] => [sin(t * 9) * W * 0.05, -H * t];
    const noeuds = [0.2, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92].map((t, j) => {
      const [x, y] = pt(t);
      const sd = j % 2 ? 1 : -1;
      const grappe = j === 1 || j === 3 || j === 5;
      return (
        <g key={j}>
          {composee(`l${j}`, x, y, sd * 66, ls * 1.5 * (1.2 - t * 0.4), 2, ls * 0.85, [VERTS[2], VERTS[3]])}
          {grappe && (
            <g transform={`translate(${f(x)} ${f(y)})`}>
              {[0, 1, 2].map((k) => {
                const fx = -sd * (rt * 1.1 + k * rt * 1.7), fy = rt * (1 + (k % 2) * 1.3);
                const mur = j !== 5; // les fruits du haut restent verts
                return (
                  <g key={k}>
                    <path d={`M0,0 Q${f(fx * 0.5)},${f(fy * 0.2)} ${f(fx)},${f(fy - rt)}`} fill="none" stroke="#4f8a34" strokeWidth={f(Math.max(0.4, H * 0.012))} />
                    <circle cx={f(fx)} cy={f(fy)} r={f(rt)} fill={mur ? couleur : "#86b94a"} stroke="#000" strokeOpacity={0.3} strokeWidth={0.35} />
                    <circle cx={f(fx - rt * 0.3)} cy={f(fy - rt * 0.35)} r={f(rt * 0.28)} fill="#fff" opacity={0.5} />
                    <path d={`M${f(fx - rt * 0.5)},${f(fy - rt * 0.9)} L${f(fx)},${f(fy - rt * 0.5)} L${f(fx + rt * 0.5)},${f(fy - rt * 0.9)} L${f(fx)},${f(fy - rt * 1.15)}Z`} fill="#3f8f2e" />
                  </g>
                );
              })}
            </g>
          )}
        </g>
      );
    });
    const [tx, ty] = pt(1);
    return {
      W,
      corps: (
        <>
          {ligne("tuteur", W * 0.34, 0, W * 0.34, -H * 1.03, "#b88a55", Math.max(1, H * 0.022))}
          <polyline points={tracer(Array.from({ length: 11 }, (_, j) => pt(j / 10)))} fill="none" stroke="#5a8f3a" strokeWidth={f(Math.max(0.9, H * 0.03))} strokeLinecap="round" />
          {noeuds}
          {composee("top", tx, ty, (rand() - 0.5) * 30, ls * 0.9, 1, ls * 0.7, [VERTS[1], VERTS[2]])}
          {fleur5("f1", tx - W * 0.12, ty + H * 0.06, clamp(H * 0.05, 1.3, 4), "#f6d52e", "#c9921a")}
        </>
      ),
    };
  },

  // Courgette, concombre : grandes feuilles lobées sur de longs pétioles, fleurs jaunes, fruit allongé
  courgette: ({ H, hcm, esp, s, rand, u, fruit }) => {
    const W = Math.max(clamp((esp ?? 80) * 0.9, hcm * 1.2, hcm * 2.2) * s, 12);
    const n = 6;
    const feuilles = Array.from({ length: n }, (_, i) => {
      const a = ((i / (n - 1)) * 2 - 1) * 1.35 + (rand() - 0.5) * 0.2;
      const len = H * (0.5 + 0.45 * rand());
      const tx = sin(a) * len * (W / H > 1 ? 1.2 : 0.9), ty = -cos(a) * len * 0.85 - H * 0.1;
      const R = H * (0.2 + 0.07 * rand());
      const r0 = rand() * 72;
      return { i, tx, ty, R, r0, len };
    }).sort((p, q) => q.len - p.len);
    const dessin = feuilles.map(({ i, tx, ty, R, r0 }) => (
      <g key={i}>
        <path d={`M0,${f(-H * 0.05)} Q${f(tx * 0.4)},${f(ty * 0.9)} ${f(tx)},${f(ty)}`} fill="none" stroke="#5a8f3a" strokeWidth={f(Math.max(0.7, H * 0.025))} strokeLinecap="round" />
        <g transform={`translate(${f(tx)} ${f(ty)}) scale(1 0.72)`}>
          <path d={lobes(R, 5)} transform={`rotate(${f(r0)})`} fill={u(i % 2 ? "leafD" : "leafL")} stroke="#1f4d1a" strokeOpacity={0.5} strokeWidth={0.4} />
          {Array.from({ length: 5 }, (_, k) => {
            const t = ((k * 2 * Math.PI) / 5) + (r0 * Math.PI) / 180;
            return ligne(k, 0, 0, sin(t) * R * 0.9, -cos(t) * R * 0.9, "#d9f2c0", 0.35, 0.45);
          })}
        </g>
      </g>
    ));
    const rl = clamp(H * 0.2, 3, 12);
    const vert = fruit ?? "#3f7d2b";
    const fruits = [-1, 1].slice(0, W > 40 ? 2 : 1).map((sd) => (
      <g key={sd} transform={`translate(${f(sd * W * 0.27)} ${f(-rl * 0.18)}) rotate(${f(-sd * 12)})`}>
        <ellipse rx={f(rl)} ry={f(rl * 0.3)} fill={vert} stroke="#000" strokeOpacity={0.35} strokeWidth={0.4} />
        <line x1={f(-rl * 0.8)} y1={f(-rl * 0.08)} x2={f(rl * 0.8)} y2={f(-rl * 0.08)} stroke="#c8e6a0" strokeOpacity={0.55} strokeWidth={0.5} />
        <ellipse cx={f(-rl * 0.3)} cy={f(-rl * 0.14)} rx={f(rl * 0.45)} ry={f(rl * 0.07)} fill="#fff" opacity={0.4} />
        <circle cx={f(sd * rl)} cy={0} r={f(rl * 0.12)} fill="#e6c14a" />
      </g>
    ));
    const fleurs = [-0.14, 0.12].map((dx, i) => (
      <path key={i} d={Array.from({ length: 10 }, (_, k) => {
        const t = (k / 10) * Math.PI * 2, r = (k % 2 ? 0.45 : 1) * clamp(H * 0.075, 1.5, 5);
        return `${k ? "L" : "M"}${f(dx * W + sin(t) * r)},${f(-H * 0.32 + (i ? H * 0.05 : 0) - cos(t) * r)}`;
      }).join("") + "Z"} fill="#f6b21a" stroke="#a86a0a" strokeOpacity={0.5} strokeWidth={0.3} />
    ));
    return { W, corps: <>{fruits}{dessin}{fleurs}</> };
  },

  // Melon, pastèque, courge : tiges rampantes à feuilles lobées, gros fruits ronds posés au sol
  melon: ({ H, hcm, esp, s, rand, u, fruit }) => {
    const W = Math.max(clamp(esp ?? 100, hcm * 2, hcm * 4) * s, 14);
    const rf = clamp(H * 0.13, 2, 10);
    const couleur = fruit ?? "#e3c35f";
    const lianes = Array.from({ length: 5 }, (_, i) => {
      const a = (i / 4) * 2 - 1;
      return <path key={i} d={`M0,${f(-H * 0.05)} Q${f(a * W * 0.25)},${f(-H * (0.25 + 0.1 * rand()))} ${f(a * W * 0.5)},${f(-H * (0.07 + 0.1 * rand()))}`} fill="none" stroke="#5a8f3a" strokeWidth={f(Math.max(0.7, H * 0.028))} strokeLinecap="round" />;
    });
    const feuilles = Array.from({ length: 10 }, () => ({ x: (rand() * 2 - 1) * W * 0.48, y: -H * (0.1 + 0.5 * rand()), R: H * (0.15 + 0.08 * rand()), r0: rand() * 360 }))
      .sort((p, q) => p.y - q.y)
      .map(({ x, y, R, r0 }, i) => (
        <g key={i} transform={`translate(${f(x)} ${f(y)}) scale(1 0.7)`}>
          <path d={lobes(R, 5)} transform={`rotate(${f(r0)})`} fill={u(i % 2 ? "leafD" : "leafL")} stroke="#1f4d1a" strokeOpacity={0.5} strokeWidth={0.4} />
          {Array.from({ length: 5 }, (_, k) => {
            const t = (k * 2 * Math.PI) / 5 + (r0 * Math.PI) / 180;
            return ligne(k, 0, 0, sin(t) * R * 0.85, -cos(t) * R * 0.85, "#d9f2c0", 0.3, 0.4);
          })}
        </g>
      ));
    const fruits = [-0.24, 0.2].map((dx, i) => {
      const x = dx * W + (rand() - 0.5) * W * 0.06, r = rf * (i ? 0.9 : 1);
      return (
        <g key={i} transform={`translate(${f(x)} ${f(-r * 0.7)})`}>
          <circle r={f(r)} fill={couleur} stroke="#000" strokeOpacity={0.35} strokeWidth={0.45} />
          {[-0.45, 0, 0.45].map((k) => (
            <path key={k} d={`M${f(k * r)},${f(-r * 0.95)} Q${f(k * r * 1.6)},0 ${f(k * r)},${f(r * 0.95)}`} fill="none" stroke="#000" strokeOpacity={0.14} strokeWidth={f(Math.max(0.35, r * 0.1))} />
          ))}
          <ellipse cx={f(-r * 0.35)} cy={f(-r * 0.4)} rx={f(r * 0.3)} ry={f(r * 0.18)} fill="#fff" opacity={0.4} />
          <circle cx={0} cy={f(-r)} r={f(r * 0.12)} fill="#6b8f3a" />
        </g>
      );
    });
    return { W, corps: <>{lianes}{feuilles}{fruits}</> };
  },
};
