import type { Point } from "@/lib/history";

const fmtNum = (n: number) => (Math.abs(n) >= 100 ? n.toFixed(0) : n.toFixed(1).replace(/\.0$/, ""));

export function LineChart({
  points, from, to, min, max, unite, bucketMs, marks = [],
}: {
  points: Point[]; from: number; to: number; min: number | null; max: number | null;
  unite: string; bucketMs: number; marks?: { t: number; icone: string; label: string }[];
}) {
  if (points.length === 0) {
    return <p className="rounded-lg bg-black/5 p-6 text-center text-sm text-muted dark:bg-white/5">Pas de données sur cette période.</p>;
  }
  const W = 640, H = 190, L = 46, R = 12, T = 18, B = 24;
  const vals = points.map((p) => p.v);
  let lo = Math.min(...vals, ...(min !== null ? [min] : []));
  let hi = Math.max(...vals, ...(max !== null ? [max] : []));
  const pad = (hi - lo) * 0.12 || 1;
  lo -= pad;
  hi += pad;
  const x = (t: number) => L + ((t - from) / (to - from)) * (W - L - R);
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);

  // Segments : on coupe la ligne si le capteur est resté muet trop longtemps.
  const gap = Math.max(bucketMs * 4, 3 * 3_600_000);
  const segs: Point[][] = [];
  for (const p of points) {
    const cur = segs[segs.length - 1];
    if (cur && p.t - cur[cur.length - 1].t <= gap) cur.push(p);
    else segs.push([p]);
  }

  const longRange = to - from > 2 * 86_400_000;
  const fmtT = (t: number) =>
    new Date(t).toLocaleString("fr-FR", longRange ? { day: "2-digit", month: "2-digit" } : { hour: "2-digit", minute: "2-digit" });
  const xTicks = [0, 1 / 3, 2 / 3, 1].map((f) => from + f * (to - from));
  const yTicks = [lo + pad, (lo + hi) / 2, hi - pad];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img">
      {min !== null && max !== null && (
        <rect x={L} width={W - L - R} y={y(max)} height={Math.max(0, y(min) - y(max))} className="fill-green-500/10" />
      )}
      {yTicks.map((v, i) => (
        <g key={i}>
          <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-border" strokeDasharray="3 3" />
          <text x={L - 6} y={y(v) + 4} textAnchor="end" className="fill-muted text-[10px]">{fmtNum(v)}</text>
        </g>
      ))}
      {xTicks.map((t, i) => (
        <text key={i} x={x(t)} y={H - 6} textAnchor={i === 0 ? "start" : i === xTicks.length - 1 ? "end" : "middle"} className="fill-muted text-[10px]">{fmtT(t)}</text>
      ))}
      {[min, max].map((v, i) => v !== null && (
        <line key={i} x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="stroke-green-600/50" strokeDasharray="5 4" />
      ))}
      {marks.map((m, i) => (
        <g key={i}>
          <line x1={x(m.t)} x2={x(m.t)} y1={T} y2={H - B} className="stroke-sky-500/50" strokeDasharray="2 3" />
          <text x={x(m.t)} y={T - 4} textAnchor="middle" className="text-[11px]"><title>{m.label}</title>{m.icone}</text>
        </g>
      ))}
      {segs.map((s, i) =>
        s.length === 1 ? (
          <circle key={i} cx={x(s[0].t)} cy={y(s[0].v)} r={3} className="fill-green-600" />
        ) : (
          <polyline key={i} points={s.map((p) => `${x(p.t)},${y(p.v)}`).join(" ")} fill="none" strokeWidth={2} strokeLinejoin="round" className="stroke-green-600" />
        ),
      )}
      {points.length <= 80 && points.map((p) => (
        <circle key={p.t} cx={x(p.t)} cy={y(p.v)} r={4} className="fill-transparent hover:fill-green-600">
          <title>{`${new Date(p.t).toLocaleString("fr-FR")} : ${fmtNum(p.v)} ${unite}`}</title>
        </circle>
      ))}
    </svg>
  );
}

export function Sparkline({ points, w = 84, h = 26 }: { points: Point[]; w?: number; h?: number }) {
  if (points.length < 2) return <span className="text-xs text-muted">—</span>;
  const ts = points.map((p) => p.t), vs = points.map((p) => p.v);
  const t0 = Math.min(...ts), t1 = Math.max(...ts);
  const lo = Math.min(...vs), hi = Math.max(...vs);
  const x = (t: number) => 1 + ((t - t0) / (t1 - t0 || 1)) * (w - 2);
  const y = (v: number) => 2 + (1 - (v - lo) / (hi - lo || 1)) * (h - 4);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} aria-hidden>
      <polyline points={points.map((p) => `${x(p.t)},${y(p.v)}`).join(" ")} fill="none" strokeWidth={1.5} strokeLinejoin="round" className="stroke-green-600" />
    </svg>
  );
}

/** Jauge horizontale 0–100 % avec la plage souhaitée en vert. */
export function Gauge({ value, min, max }: { value: number | null; min: number | null; max: number | null }) {
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  return (
    <div className="relative h-2.5 w-full rounded-full bg-black/10 dark:bg-white/10">
      {min !== null && max !== null && (
        <div className="absolute inset-y-0 rounded-full bg-green-500/30" style={{ left: `${clamp(min)}%`, width: `${clamp(max) - clamp(min)}%` }} />
      )}
      {value !== null && <div className="absolute -top-0.5 h-3.5 w-1.5 -translate-x-1/2 rounded bg-foreground" style={{ left: `${clamp(value)}%` }} />}
    </div>
  );
}
