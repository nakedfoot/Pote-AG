"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { placerPlant } from "@/app/actions/plan";
import CarreDessus from "@/components/CarreDessus";
import {
  DEFAUT_CARRE_CM, EPAISSEUR_CM, UNITES_MAX_DESSUS, ZONE_MIN, dimsGrille, formatDimensions, grille, tailleZoneDefaut,
} from "@/lib/carres";

export type Etat = "ok" | "bas" | "haut" | "inconnu";
export type BoardCarre = {
  id: number; zone_id: number; zone_nom: string; zone_couleur: string; nom: string;
  longueur: number | null; largeur: number | null; hauteur: number | null;
};
export type BoardPlant = {
  id: number; nom: string; variete: string | null; photo: string | null; espacement: number | null;
  carre_id: number | null; x: number | null; y: number | null; w: number | null; h: number | null; quantite: number; etat: Etat;
};

/**
 * Zone de plantation d'un plant : carré (ou null = non placé), centre (x, y) et taille (w, h) en fractions 0..1 de la
 * surface de terre ; w et h null = taille par défaut (selon le nombre d'unités).
 */
type Pos = { carreId: number | null; x: number; y: number; w: number | null; h: number | null };
type Drag = { id: number; sx: number; sy: number; x: number; y: number; moved: boolean };
type Coin = "nw" | "ne" | "sw" | "se";
type Resize = { id: number; coin: Coin; sol: HTMLElement; carreId: number; x: number; y: number; w: number; h: number };

const COULEUR: Record<Etat, string> = { ok: "#16a34a", bas: "#f59e0b", haut: "#dc2626", inconnu: "#9ca3af" };
const clamp = (n: number, min = 0, max = 1) => Math.min(max, Math.max(min, n));
/** Centre ramené dans le carré pour que toute la zone de largeur `w` y reste. */
const centre = (v: number, w: number) => clamp(v, Math.min(w, 1) / 2, 1 - Math.min(w, 1) / 2);

/** Positions de départ : celles enregistrées, sinon une grille régulière dans le carré. */
function initiales(plants: BoardPlant[], carres: BoardCarre[]): Record<number, Pos> {
  const out: Record<number, Pos> = {};
  const sans = new Map<number, BoardPlant[]>();
  for (const p of plants) {
    if (p.carre_id === null) out[p.id] = { carreId: null, x: 0.5, y: 0.5, w: null, h: null };
    else if (p.x !== null && p.y !== null) out[p.id] = { carreId: p.carre_id, x: p.x, y: p.y, w: p.w, h: p.h };
    else sans.set(p.carre_id, [...(sans.get(p.carre_id) ?? []), p]);
  }
  for (const [cid, list] of sans) {
    const c = carres.find((x) => x.id === cid);
    const pts = grille(list.length, (c?.longueur ?? DEFAUT_CARRE_CM) / (c?.largeur ?? DEFAUT_CARRE_CM));
    list.forEach((p, i) => {
      out[p.id] = { carreId: cid, ...pts[i], w: p.w, h: p.h };
    });
  }
  return out;
}

function Avatar({ p, className, style }: { p: BoardPlant; className: string; style?: React.CSSProperties }) {
  return p.photo ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={p.photo} alt="" draggable={false} style={style} className={`${className} object-cover`} />
  ) : (
    <span style={style} className={`${className} flex items-center justify-center bg-green-100 dark:bg-green-900/50`}>🌱</span>
  );
}

export default function PotagerBoard({ carres, plants }: { carres: BoardCarre[]; plants: BoardPlant[] }) {
  const [pos, setPos] = useState(() => initiales(plants, carres));
  const [drag, setDrag] = useState<Drag | null>(null);
  const [resize, setResize] = useState<Resize | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const posRef = useRef(pos);
  const dragRef = useRef(drag);
  const resizeRef = useRef(resize);
  const lastY = useRef(0);
  const dragging = drag !== null;
  const resizing = resize !== null;

  useEffect(() => {
    posRef.current = pos;
    dragRef.current = drag;
    resizeRef.current = resize;
  }, [pos, drag, resize]);

  const byId = useMemo(() => new Map(plants.map((p) => [p.id, p])), [plants]);
  const carreNom = (id: number | null) => carres.find((c) => c.id === id);
  const sol = (c: BoardCarre | undefined) => ({
    l: (c?.longueur ?? DEFAUT_CARRE_CM) - 2 * EPAISSEUR_CM,
    w: (c?.largeur ?? DEFAUT_CARRE_CM) - 2 * EPAISSEUR_CM,
  });
  /** Taille de la zone d'un plant dans un carré : celle enregistrée, sinon celle par défaut. */
  const taille = (p: BoardPlant, c: BoardCarre | undefined, w: number | null, h: number | null) => {
    const s = sol(c);
    const d = tailleZoneDefaut(p.quantite, p.espacement, s.l, s.w);
    return { w: w ?? d.w, h: h ?? d.h };
  };
  /** Enregistre la zone d'un plant (optimiste, avec retour arrière si le serveur refuse). */
  const enregistrer = (id: number, prev: Pos, dest: Pos) => {
    setPos((p) => ({ ...p, [id]: dest }));
    setMsg(null);
    const annuler = (text: string) => {
      setPos((p) => ({ ...p, [id]: prev }));
      setMsg({ ok: false, text });
    };
    start(async () => {
      try {
        const r = await placerPlant(id, dest.carreId, dest.x, dest.y, dest.w, dest.h);
        if (!r.ok) annuler(r.message);
      } catch {
        annuler("Enregistrement impossible (connexion perdue ou session expirée).");
      }
    });
  };

  // ---- Glisser-déposer (pointeur : souris et tactile) ----
  useEffect(() => {
    if (!dragging) return;

    const drop = (d: Drag, x: number, y: number) => {
      const prev = posRef.current[d.id];
      if (!d.moved) return; // simple clic : rien
      const els = document.elementsFromPoint(x, y).filter((e): e is HTMLElement => e instanceof HTMLElement);
      const box = els.find((e) => e.dataset.carreBox !== undefined);
      const soil = box?.querySelector<HTMLElement>("[data-carre-soil]");
      let next: Pos | null = null;
      if (box && soil) {
        const r = soil.getBoundingClientRect();
        const carreId = Number(box.dataset.carreBox);
        // Même carré : on garde la taille de la zone ; autre carré : taille par défaut
        const garde = prev.carreId === carreId;
        const plant = byId.get(d.id)!;
        const t = taille(plant, carres.find((c) => c.id === carreId), garde ? prev.w : null, garde ? prev.h : null);
        next = {
          carreId, x: centre((x - r.left) / r.width, t.w), y: centre((y - r.top) / r.height, t.h),
          w: garde ? prev.w : null, h: garde ? prev.h : null,
        };
      } else if (els.some((e) => e.dataset.dropListe !== undefined)) {
        next = { carreId: null, x: 0.5, y: 0.5, w: null, h: null };
      }
      if (!next || (next.carreId === null && prev.carreId === null)) return;
      enregistrer(d.id, prev, next);
    };

    const move = (e: PointerEvent) => {
      lastY.current = e.clientY;
      setDrag((d) => (d ? { ...d, x: e.clientX, y: e.clientY, moved: d.moved || Math.hypot(e.clientX - d.sx, e.clientY - d.sy) > 5 } : d));
    };
    const up = (e: PointerEvent) => {
      const d = dragRef.current;
      setDrag(null);
      if (d) drop(d, e.clientX, e.clientY);
    };
    const cancel = () => setDrag(null);
    // Défilement automatique près des bords de l'écran (utile sur mobile, où la liste est sous les carrés)
    const scroll = setInterval(() => {
      if (!dragRef.current?.moved) return;
      if (lastY.current < 80) window.scrollBy(0, -14);
      else if (lastY.current > window.innerHeight - 80) window.scrollBy(0, 14);
    }, 16);

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      clearInterval(scroll);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragging]);

  // ---- Redimensionnement de la zone (poignées aux quatre coins) ----
  useEffect(() => {
    if (!resizing) return;
    const move = (e: PointerEvent) => {
      setResize((r) => {
        if (!r) return r;
        const b = r.sol.getBoundingClientRect();
        const px = clamp((e.clientX - b.left) / b.width), py = clamp((e.clientY - b.top) / b.height);
        // Le coin opposé à la poignée reste fixe
        const ax = r.coin.includes("w") ? r.x + r.w / 2 : r.x - r.w / 2;
        const ay = r.coin.includes("n") ? r.y + r.h / 2 : r.y - r.h / 2;
        const x1 = r.coin.includes("w") ? Math.min(px, ax - ZONE_MIN) : Math.max(px, ax + ZONE_MIN);
        const y1 = r.coin.includes("n") ? Math.min(py, ay - ZONE_MIN) : Math.max(py, ay + ZONE_MIN);
        const l = clamp(Math.min(ax, x1)), rt = clamp(Math.max(ax, x1)), t = clamp(Math.min(ay, y1)), bt = clamp(Math.max(ay, y1));
        return { ...r, x: (l + rt) / 2, y: (t + bt) / 2, w: rt - l, h: bt - t, };
      });
    };
    const up = () => {
      const r = resizeRef.current;
      setResize(null);
      if (!r) return;
      const prev = posRef.current[r.id];
      enregistrer(r.id, prev, { carreId: r.carreId, x: r.x, y: r.y, w: r.w, h: r.h });
    };
    const cancel = () => setResize(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
  }, [resizing]);

  const startResize = (e: React.PointerEvent, id: number, coin: Coin, carreId: number, w: number, h: number) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const soilEl = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-carre-soil]");
    if (!soilEl) return;
    const p = posRef.current[id];
    setResize({ id, coin, sol: soilEl, carreId, x: p.x, y: p.y, w, h });
  };

  const startDrag = (e: React.PointerEvent, id: number) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    lastY.current = e.clientY;
    setDrag({ id, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, moved: false });
  };

  // ---- Données dérivées ----
  const zones = useMemo(() => {
    const m = new Map<number, { nom: string; couleur: string; carres: BoardCarre[] }>();
    for (const c of carres) {
      if (!m.has(c.zone_id)) m.set(c.zone_id, { nom: c.zone_nom, couleur: c.zone_couleur, carres: [] });
      m.get(c.zone_id)!.carres.push(c);
    }
    return [...m.values()];
  }, [carres]);

  const filtre = q.trim().toLowerCase();
  const visibles = plants.filter((p) => !filtre || `${p.nom} ${p.variete ?? ""}`.toLowerCase().includes(filtre));
  const aPlacer = visibles.filter((p) => pos[p.id]?.carreId === null);
  const places = visibles.filter((p) => pos[p.id]?.carreId !== null);
  const enCours = drag?.moved ? byId.get(drag.id) : undefined;

  const ligne = (p: BoardPlant) => {
    const c = carreNom(pos[p.id]?.carreId ?? null);
    return (
      <li key={p.id} className={`flex items-center gap-3 rounded-lg px-1.5 py-1.5 hover:bg-black/5 dark:hover:bg-white/5 ${drag?.id === p.id && drag.moved ? "opacity-40" : ""}`}>
        <div
          onPointerDown={(e) => startDrag(e, p.id)}
          style={{ touchAction: "none" }}
          className="shrink-0 cursor-grab select-none rounded-full ring-2 ring-offset-1 ring-offset-card active:cursor-grabbing"
          title="Glisser sur un carré"
        >
          <Avatar p={p} className="h-10 w-10 rounded-full" />
        </div>
        <Link href={`/plants/${p.id}`} className="min-w-0 flex-1 text-sm hover:underline">
          <span className="block truncate font-medium">{p.nom}</span>
          <span className="block truncate text-xs text-muted">
            {c ? `📍 ${c.zone_nom} › ${c.nom}` : "Non placé"}
            {p.variete ? ` · ${p.variete}` : ""}
          </span>
        </Link>
      </li>
    );
  };

  if (carres.length === 0) {
    return (
      <p className="card text-sm">
        Commencez par créer des <Link href="/zones" className="underline">zones</Link> et des <Link href="/carres" className="underline">carrés</Link>.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="min-h-5 text-sm">
        {pending ? <span className="text-muted">Enregistrement…</span> : msg && <span className={msg.ok ? "text-green-700" : "text-red-700"}>{msg.text}</span>}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* ---- Carrés vus du dessus, par zone ---- */}
        <div className="space-y-6">
          {zones.map((z) => (
            <section key={z.nom + z.couleur} className="space-y-3">
              <h2 className="flex items-center gap-2 border-b border-border pb-1 text-lg font-semibold">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: z.couleur }} /> {z.nom}
              </h2>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(20rem,100%),1fr))] gap-4">
                {z.carres.map((c) => {
                  const dedans = plants.filter((p) => pos[p.id]?.carreId === c.id);
                  const s = sol(c);
                  return (
                    <div key={c.id} className="card space-y-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="truncate font-medium">{c.nom}</h3>
                        <span className="shrink-0 text-xs text-muted">🌱 {dedans.length}</span>
                      </div>
                      <CarreDessus carreId={c.id} longueur={c.longueur} largeur={c.largeur}>
                        {dedans.map((p) => {
                          const ps = pos[p.id];
                          const live = resize?.id === p.id ? resize : null;
                          const { x, y, w, h } = live ?? { x: ps.x, y: ps.y, ...taille(p, c, ps.w, ps.h) };
                          const n = Math.min(p.quantite, UNITES_MAX_DESSUS);
                          const { cols, rows } = dimsGrille(n, w * s.l, h * s.w);
                          const coins: [Coin, string][] = [["nw", "-left-2 -top-2 cursor-nwse-resize"], ["ne", "-right-2 -top-2 cursor-nesw-resize"], ["sw", "-bottom-2 -left-2 cursor-nesw-resize"], ["se", "-bottom-2 -right-2 cursor-nwse-resize"]];
                          return (
                            <div
                              key={p.id}
                              onPointerDown={(e) => startDrag(e, p.id)}
                              title={`${p.nom} · ${p.quantite} unité${p.quantite > 1 ? "s" : ""}`}
                              style={{
                                left: `${(x - w / 2) * 100}%`, top: `${(y - h / 2) * 100}%`, width: `${w * 100}%`, height: `${h * 100}%`,
                                minWidth: 28, minHeight: 28, touchAction: "none", borderColor: COULEUR[p.etat],
                              }}
                              className={`group absolute z-10 cursor-grab rounded-xl border-[3px] bg-white/25 shadow-md backdrop-blur-[1px] active:cursor-grabbing ${drag?.id === p.id && drag.moved ? "opacity-30" : ""}`}
                            >
                              <div className="grid h-full w-full" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridTemplateRows: `repeat(${rows}, 1fr)` }}>
                                {Array.from({ length: n }, (_, i) => (
                                  <div key={i} className="flex items-center justify-center" style={{ containerType: "size" }}>
                                    <Avatar p={p} className="rounded-full text-[10px] shadow" style={{ width: "min(85cqw, 85cqh)", height: "min(85cqw, 85cqh)" }} />
                                  </div>
                                ))}
                              </div>
                              {p.quantite > 1 && (
                                <span className="pointer-events-none absolute -top-2.5 left-1 rounded-full bg-black/70 px-1.5 text-[10px] font-medium leading-4 text-white">
                                  ×{p.quantite}{p.quantite > n ? ` (${n} dessinés)` : ""}
                                </span>
                              )}
                              {coins.map(([coin, cls]) => (
                                <span
                                  key={coin}
                                  onPointerDown={(e) => startResize(e, p.id, coin, c.id, w, h)}
                                  style={{ touchAction: "none" }}
                                  className={`absolute z-20 h-4 w-4 rounded-full border-2 border-white bg-green-600 shadow ${cls} opacity-70 group-hover:opacity-100`}
                                />
                              ))}
                              <span className="pointer-events-none absolute left-1/2 top-full z-30 mt-3 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white group-hover:block">
                                {p.nom}
                              </span>
                            </div>
                          );
                        })}
                      </CarreDessus>
                      <p className="text-xs text-muted">
                        {formatDimensions(c.longueur, c.largeur, c.hauteur) ?? "Dimensions non renseignées (carré supposé de 120 × 120 cm)"}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        {/* ---- Liste des plants (à droite) ---- */}
        <aside data-drop-liste className="card space-y-3 self-start lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          <div>
            <h2 className="font-semibold">🌱 Plants</h2>
            <p className="text-xs text-muted">Glissez un plant sur un carré pour le placer, ou ici pour le retirer.</p>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" className="input" />
          {plants.length === 0 && <p className="text-sm text-muted">Aucun plant. <Link href="/plants/new" className="underline">Ajouter un plant</Link>.</p>}
          {aPlacer.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">À placer · {aPlacer.length}</h3>
              <ul>{aPlacer.map(ligne)}</ul>
            </div>
          )}
          {places.length > 0 && (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">Placés · {places.length}</h3>
              <ul>{places.map(ligne)}</ul>
            </div>
          )}
        </aside>
      </div>

      {enCours && (
        <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2" style={{ left: drag!.x, top: drag!.y }}>
          <Avatar p={enCours} className="h-14 w-14 rounded-full border-[3px] border-white shadow-xl" />
        </div>
      )}
    </div>
  );
}
