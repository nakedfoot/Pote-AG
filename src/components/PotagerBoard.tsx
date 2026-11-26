"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { placerPlant } from "@/app/actions/plan";
import CarreDessus from "@/components/CarreDessus";
import { DEFAUT_CARRE_CM, EPAISSEUR_CM, formatDimensions, grille } from "@/lib/carres";

export type Etat = "ok" | "bas" | "haut" | "inconnu";
export type BoardCarre = {
  id: number; zone_id: number; zone_nom: string; zone_couleur: string; nom: string;
  longueur: number | null; largeur: number | null; hauteur: number | null;
};
export type BoardPlant = {
  id: number; nom: string; variete: string | null; photo: string | null; espacement: number | null;
  carre_id: number | null; x: number | null; y: number | null; etat: Etat;
};

/** Position d'un plant : carré (ou null = non placé) et fractions 0..1 de la surface de terre. */
type Pos = { carreId: number | null; x: number; y: number };
type Drag = { id: number; sx: number; sy: number; x: number; y: number; moved: boolean };

const COULEUR: Record<Etat, string> = { ok: "#16a34a", bas: "#f59e0b", haut: "#dc2626", inconnu: "#9ca3af" };
const clamp = (n: number) => Math.min(1, Math.max(0, n));

/** Positions de départ : celles enregistrées, sinon une grille régulière dans le carré. */
function initiales(plants: BoardPlant[], carres: BoardCarre[]): Record<number, Pos> {
  const out: Record<number, Pos> = {};
  const sans = new Map<number, BoardPlant[]>();
  for (const p of plants) {
    if (p.carre_id === null) out[p.id] = { carreId: null, x: 0.5, y: 0.5 };
    else if (p.x !== null && p.y !== null) out[p.id] = { carreId: p.carre_id, x: p.x, y: p.y };
    else sans.set(p.carre_id, [...(sans.get(p.carre_id) ?? []), p]);
  }
  for (const [cid, list] of sans) {
    const c = carres.find((x) => x.id === cid);
    const pts = grille(list.length, (c?.longueur ?? DEFAUT_CARRE_CM) / (c?.largeur ?? DEFAUT_CARRE_CM));
    list.forEach((p, i) => {
      out[p.id] = { carreId: cid, ...pts[i] };
    });
  }
  return out;
}

function Avatar({ p, className }: { p: BoardPlant; className: string }) {
  return p.photo ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={p.photo} alt="" draggable={false} className={`${className} object-cover`} />
  ) : (
    <span className={`${className} flex items-center justify-center bg-green-100 dark:bg-green-900/50`}>🌱</span>
  );
}

export default function PotagerBoard({ carres, plants }: { carres: BoardCarre[]; plants: BoardPlant[] }) {
  const router = useRouter();
  const [pos, setPos] = useState(() => initiales(plants, carres));
  const [drag, setDrag] = useState<Drag | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [q, setQ] = useState("");
  const [pending, start] = useTransition();
  const posRef = useRef(pos);
  const dragRef = useRef(drag);
  const lastY = useRef(0);
  const dragging = drag !== null;

  useEffect(() => {
    posRef.current = pos;
    dragRef.current = drag;
  }, [pos, drag]);

  const byId = useMemo(() => new Map(plants.map((p) => [p.id, p])), [plants]);
  const carreNom = (id: number | null) => carres.find((c) => c.id === id);

  // ---- Glisser-déposer (pointeur : souris et tactile) ----
  useEffect(() => {
    if (!dragging) return;

    const drop = (d: Drag, x: number, y: number) => {
      const prev = posRef.current[d.id];
      if (!d.moved) {
        if (prev?.carreId !== null) router.push(`/plants/${d.id}`); // simple clic sur un plant placé : ouvre sa fiche
        return;
      }
      const els = document.elementsFromPoint(x, y).filter((e): e is HTMLElement => e instanceof HTMLElement);
      const box = els.find((e) => e.dataset.carreBox !== undefined);
      const soil = box?.querySelector<HTMLElement>("[data-carre-soil]");
      let next: Pos | null = null;
      if (box && soil) {
        const r = soil.getBoundingClientRect();
        next = { carreId: Number(box.dataset.carreBox), x: clamp((x - r.left) / r.width), y: clamp((y - r.top) / r.height) };
      } else if (els.some((e) => e.dataset.dropListe !== undefined)) {
        next = { carreId: null, x: 0.5, y: 0.5 };
      }
      if (!next || (next.carreId === null && prev.carreId === null)) return;
      const dest = next;
      setPos((p) => ({ ...p, [d.id]: dest }));
      setMsg(null);
      const annuler = (text: string) => {
        setPos((p) => ({ ...p, [d.id]: prev }));
        setMsg({ ok: false, text });
      };
      start(async () => {
        try {
          const r = await placerPlant(d.id, dest.carreId, dest.x, dest.y);
          if (!r.ok) annuler(r.message);
        } catch {
          annuler("Enregistrement impossible (connexion perdue ou session expirée).");
        }
      });
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
  }, [dragging, router]);

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
                  const solCm = (c.longueur ?? DEFAUT_CARRE_CM) - 2 * EPAISSEUR_CM;
                  return (
                    <div key={c.id} className="card space-y-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="truncate font-medium">{c.nom}</h3>
                        <span className="shrink-0 text-xs text-muted">🌱 {dedans.length}</span>
                      </div>
                      <CarreDessus carreId={c.id} longueur={c.longueur} largeur={c.largeur}>
                        {dedans.map((p) => {
                          const { x, y } = pos[p.id];
                          const d = Math.min(60, Math.max(15, p.espacement ?? 30)); // diamètre estimé (cm)
                          return (
                            <div
                              key={p.id}
                              onPointerDown={(e) => startDrag(e, p.id)}
                              style={{ left: `${x * 100}%`, top: `${y * 100}%`, width: `${(d / solCm) * 100}%`, minWidth: 28, aspectRatio: "1", touchAction: "none", borderColor: COULEUR[p.etat] }}
                              className={`group absolute z-10 -translate-x-1/2 -translate-y-1/2 cursor-grab rounded-full border-[3px] bg-card shadow-md active:cursor-grabbing ${drag?.id === p.id && drag.moved ? "opacity-30" : ""}`}
                            >
                              <Avatar p={p} className="h-full w-full rounded-full text-base" />
                              <span className="pointer-events-none absolute left-1/2 top-full z-20 mt-0.5 hidden -translate-x-1/2 whitespace-nowrap rounded bg-black/70 px-1.5 py-0.5 text-[11px] text-white group-hover:block">
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
            <p className="text-xs text-muted">Glissez un plant sur un carré pour le placer, ou ici pour le retirer. Clic sur un plant placé : sa fiche.</p>
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
