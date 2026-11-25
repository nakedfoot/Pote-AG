"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { savePlan, supprimerPlan, uploadPlan } from "@/app/actions/plan";
import AutoRefresh from "@/components/AutoRefresh";

export type Rect = { x: number; y: number; w: number; h: number }; // fractions (0..1) de l'image
export type Etat2 = "ok" | "bas" | "haut" | "inconnu" | "vide";
export type PlantInfo = { id: number; nom: string; variete: string | null; etat: Etat2; aArroser: boolean; batterieBasse: boolean };
export type ZoneItem = { id: number; nom: string; couleur: string; rect: Rect | null; etat: Etat2 };
export type CarreItem = { id: number; zone_id: number; nom: string; rect: Rect | null; etat: Etat2; plants: PlantInfo[] };

const COULEUR: Record<Etat2, string> = { ok: "#16a34a", bas: "#f59e0b", haut: "#dc2626", inconnu: "#6b7280", vide: "#94a3b8" };
const LIBELLE: Record<Etat2, string> = { ok: "OK", bas: "Trop bas", haut: "Trop haut", inconnu: "Pas de mesure", vide: "Aucun plant" };
const MIN = 0.02;
const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));

type Drag = { key: string; mode: "move" | "resize"; sx: number; sy: number; orig: Rect };

export default function PlanView({ version, zones, carres }: { version: number | null; zones: ZoneItem[]; carres: CarreItem[] }) {
  const [edit, setEdit] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [arm, setArm] = useState<string | null>(null); // élément en cours de dessin
  const [draft, setDraft] = useState<Rect | null>(null);
  const [rects, setRects] = useState<Record<string, Rect | null>>(() => {
    const r: Record<string, Rect | null> = {};
    for (const z of zones) r[`z${z.id}`] = z.rect;
    for (const c of carres) r[`c${c.id}`] = c.rect;
    return r;
  });
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);

  const pos = (e: React.PointerEvent) => {
    const b = box.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - b.left) / b.width), y: clamp((e.clientY - b.top) / b.height) };
  };
  const setRect = (key: string, r: Rect | null) => {
    setRects((prev) => ({ ...prev, [key]: r }));
    setDirty(true);
    setMsg(null);
  };

  const zoneNom = (id: number) => zones.find((z) => z.id === id)?.nom ?? "";
  const sel = selected ? { type: selected[0], id: Number(selected.slice(1)) } : null;
  const selCarre = sel?.type === "c" ? carres.find((c) => c.id === sel.id) : undefined;
  const selZone = sel?.type === "z" ? zones.find((z) => z.id === sel.id) : undefined;

  // ---- Dessin d'un nouveau rectangle ----
  const onDrawDown = (e: React.PointerEvent) => {
    drawStart.current = pos(e);
    setDraft({ ...drawStart.current, w: 0, h: 0 });
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDrawMove = (e: React.PointerEvent) => {
    const s = drawStart.current;
    if (!s) return;
    const p = pos(e);
    setDraft({ x: Math.min(s.x, p.x), y: Math.min(s.y, p.y), w: Math.abs(p.x - s.x), h: Math.abs(p.y - s.y) });
  };
  const onDrawUp = () => {
    const d = draft;
    drawStart.current = null;
    setDraft(null);
    if (arm && d && d.w > MIN && d.h > MIN) {
      setRect(arm, d);
      setSelected(arm);
      setArm(null);
    }
  };

  // ---- Déplacement / redimensionnement d'un rectangle existant ----
  const startDrag = (e: React.PointerEvent, key: string, mode: Drag["mode"]) => {
    const orig = rects[key];
    if (!edit || arm || !orig) return;
    e.stopPropagation();
    setSelected(key);
    const p = pos(e);
    drag.current = { key, mode, sx: p.x, sy: p.y, orig };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onDragMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const p = pos(e);
    const o = d.orig;
    const next: Rect =
      d.mode === "move"
        ? { ...o, x: clamp(o.x + p.x - d.sx, 0, 1 - o.w), y: clamp(o.y + p.y - d.sy, 0, 1 - o.h) }
        : { ...o, w: clamp(o.w + p.x - d.sx, MIN, 1 - o.x), h: clamp(o.h + p.y - d.sy, MIN, 1 - o.y) };
    setRects((prev) => ({ ...prev, [d.key]: next }));
    setDirty(true);
    setMsg(null);
  };
  const endDrag = () => {
    drag.current = null;
  };

  const enregistrer = () =>
    start(async () => {
      const entries = [
        ...zones.map((z) => ({ type: "zone", id: z.id, rect: rects[`z${z.id}`] ?? null })),
        ...carres.map((c) => ({ type: "carre", id: c.id, rect: rects[`c${c.id}`] ?? null })),
      ];
      const r = await savePlan(JSON.stringify(entries));
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok) setDirty(false);
    });

  const rectStyle = (r: Rect): React.CSSProperties => ({
    left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`,
  });

  // ---- Pas de plan : invitation à téléverser l'image ----
  if (version === null) {
    return (
      <div className="card max-w-xl space-y-3">
        <h2 className="font-semibold">Ajoutez le plan de votre jardin</h2>
        <p className="text-sm text-muted">
          Une photo aérienne, une capture de carte ou un dessin du jardin. Vous dessinerez ensuite vos zones et vos carrés dessus.
        </p>
        <form action={uploadPlan} className="flex flex-wrap items-center gap-3">
          <input type="file" name="plan" accept="image/*" required className="text-sm" />
          <button className="btn">Téléverser</button>
        </form>
      </div>
    );
  }

  const nonPlaces = zones.filter((z) => !rects[`z${z.id}`]).length + carres.filter((c) => !rects[`c${c.id}`]).length;

  return (
    <div className="space-y-3">
      {!edit && <AutoRefresh seconds={30} />}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-lg border border-border text-sm">
          <button className={`px-3 py-1.5 ${!edit ? "bg-green-700 text-white" : ""}`} onClick={() => { setEdit(false); setArm(null); }}>Consulter</button>
          <button className={`px-3 py-1.5 ${edit ? "bg-green-700 text-white" : ""}`} onClick={() => setEdit(true)}>Modifier le plan</button>
        </div>
        {edit && (
          <>
            <button className="btn" onClick={enregistrer} disabled={pending || !dirty}>{pending ? "Enregistrement…" : "Enregistrer le plan"}</button>
            {dirty && <span className="text-xs text-amber-700">Modifications non enregistrées</span>}
          </>
        )}
        {msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</span>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        {/* ---- Plan ---- */}
        <div
          ref={box}
          className="relative select-none overflow-hidden rounded-xl border border-border"
          onClick={() => !edit && setSelected(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/plan?v=${version}`} alt="Plan du jardin" draggable={false} className="block h-auto w-full" />

          {zones.map((z) => {
            const r = rects[`z${z.id}`];
            if (!r) return null;
            const key = `z${z.id}`;
            return (
              <div
                key={key}
                style={{ ...rectStyle(r), borderColor: z.couleur, backgroundColor: `${z.couleur}1f`, touchAction: edit ? "none" : "auto" }}
                className={`absolute z-10 rounded-md border-2 border-dashed ${selected === key ? "ring-2 ring-white/80" : ""} ${edit && !arm ? "cursor-move" : ""}`}
                onPointerDown={(e) => startDrag(e, key, "move")}
                onPointerMove={onDragMove}
                onPointerUp={endDrag}
                onClick={(e) => { e.stopPropagation(); setSelected(key); }}
              >
                <span className="pointer-events-none absolute left-1 top-0.5 rounded bg-black/55 px-1.5 text-[11px] font-medium text-white">{z.nom}</span>
                {edit && selected === key && !arm && (
                  <span
                    className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-white bg-green-700"
                    style={{ touchAction: "none" }}
                    onPointerDown={(e) => startDrag(e, key, "resize")}
                  />
                )}
              </div>
            );
          })}

          {carres.map((c) => {
            const r = rects[`c${c.id}`];
            if (!r) return null;
            const key = `c${c.id}`;
            const col = COULEUR[c.etat];
            const alerte = c.plants.filter((p) => p.etat === "bas" || p.etat === "haut").length;
            const arroser = c.plants.some((p) => p.aArroser);
            return (
              <div
                key={key}
                style={{ ...rectStyle(r), borderColor: col, backgroundColor: `${col}55`, touchAction: edit ? "none" : "auto" }}
                className={`absolute rounded-md border-2 ${selected === key ? "z-30 ring-2 ring-white" : "z-20"} ${edit && !arm ? "cursor-move" : "cursor-pointer"}`}
                onPointerDown={(e) => startDrag(e, key, "move")}
                onPointerMove={onDragMove}
                onPointerUp={endDrag}
                onClick={(e) => { e.stopPropagation(); setSelected(key); }}
                title={`${c.nom} — ${LIBELLE[c.etat]}`}
              >
                <span className="pointer-events-none absolute inset-x-0.5 top-0.5 truncate rounded bg-black/55 px-1 text-center text-[11px] font-medium leading-4 text-white">
                  {c.nom}{c.plants.length > 0 && ` · ${c.plants.length}`}{arroser && " 💧"}{alerte > 0 && " ⚠️"}
                </span>
                {edit && selected === key && !arm && (
                  <span
                    className="absolute -bottom-1.5 -right-1.5 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-white bg-green-700"
                    style={{ touchAction: "none" }}
                    onPointerDown={(e) => startDrag(e, key, "resize")}
                  />
                )}
              </div>
            );
          })}

          {/* Rectangle en cours de dessin */}
          {draft && <div style={rectStyle(draft)} className="pointer-events-none absolute z-40 rounded-md border-2 border-dashed border-white bg-white/25" />}
          {arm && (
            <div
              className="absolute inset-0 z-50 cursor-crosshair bg-black/10"
              style={{ touchAction: "none" }}
              onPointerDown={onDrawDown}
              onPointerMove={onDrawMove}
              onPointerUp={onDrawUp}
            />
          )}
        </div>

        {/* ---- Panneau latéral ---- */}
        <aside className="card space-y-3 self-start text-sm">
          {edit ? (
            <>
              <h2 className="font-semibold">Placer sur le plan</h2>
              {arm ? (
                <p className="rounded-lg bg-green-100 p-2 text-green-800">
                  Tracez un rectangle sur le plan en maintenant le clic (ou le doigt).{" "}
                  <button className="underline" onClick={() => setArm(null)}>Annuler</button>
                </p>
              ) : (
                <p className="text-muted">
                  {nonPlaces > 0 ? `${nonPlaces} élément(s) pas encore placé(s). ` : ""}
                  Cliquez « Placer », puis tracez le rectangle. Déplacez un rectangle en le faisant glisser, redimensionnez-le avec la poignée verte.
                </p>
              )}
              <ul className="space-y-1">
                {zones.map((z) => (
                  <li key={z.id}>
                    <EditRow
                      label={`📍 ${z.nom}`} placed={!!rects[`z${z.id}`]} active={selected === `z${z.id}`} bold
                      onSelect={() => setSelected(`z${z.id}`)} onPlace={() => { setSelected(null); setArm(`z${z.id}`); }}
                      onRemove={() => { setRect(`z${z.id}`, null); setSelected(null); }}
                    />
                    <ul className="ml-4 space-y-1">
                      {carres.filter((c) => c.zone_id === z.id).map((c) => (
                        <li key={c.id}>
                          <EditRow
                            label={c.nom} placed={!!rects[`c${c.id}`]} active={selected === `c${c.id}`}
                            onSelect={() => setSelected(`c${c.id}`)} onPlace={() => { setSelected(null); setArm(`c${c.id}`); }}
                            onRemove={() => { setRect(`c${c.id}`, null); setSelected(null); }}
                          />
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
              <hr className="border-border" />
              <div className="space-y-2">
                <p className="font-medium">Image du plan</p>
                <form action={uploadPlan} className="flex flex-wrap items-center gap-2">
                  <input type="file" name="plan" accept="image/*" required className="max-w-full text-xs" />
                  <button className="btn-secondary">Remplacer</button>
                </form>
                <form action={supprimerPlan}>
                  <button className="btn-danger" onClick={(e) => { if (!confirm("Supprimer l'image du plan ? Les positions des zones et carrés sont conservées.")) e.preventDefault(); }}>
                    Supprimer l&apos;image
                  </button>
                </form>
              </div>
            </>
          ) : selCarre ? (
            <>
              <div>
                <p className="text-xs text-muted">{zoneNom(selCarre.zone_id)}</p>
                <h2 className="text-lg font-semibold">{selCarre.nom}</h2>
                <Badge etat={selCarre.etat} />
              </div>
              {selCarre.plants.length === 0 ? (
                <p className="text-muted">Aucun plant dans ce carré. Affectez-en depuis la fiche d&apos;un plant.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {selCarre.plants.map((p) => (
                    <li key={p.id}>
                      <Link href={`/plants/${p.id}`} className="flex items-center justify-between gap-2 py-2 hover:underline">
                        <span>🌱 {p.nom}{p.variete && <span className="text-muted"> · {p.variete}</span>}</span>
                        <span className="flex shrink-0 items-center gap-1">
                          {p.aArroser && <span title="À arroser">💧</span>}
                          {p.batterieBasse && <span title="Batterie faible">🪫</span>}
                          <Dot etat={p.etat} />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : selZone ? (
            <>
              <div>
                <h2 className="text-lg font-semibold">{selZone.nom}</h2>
                <Badge etat={selZone.etat} />
              </div>
              <ul className="divide-y divide-border">
                {carres.filter((c) => c.zone_id === selZone.id).map((c) => (
                  <li key={c.id}>
                    <button className="flex w-full items-center justify-between py-2 text-left hover:underline" onClick={() => setSelected(`c${c.id}`)}>
                      <span>{c.nom} <span className="text-muted">· {c.plants.length} plant(s)</span></span>
                      <Dot etat={c.etat} />
                    </button>
                  </li>
                ))}
                {carres.every((c) => c.zone_id !== selZone.id) && <li className="py-2 text-muted">Aucun carré dans cette zone.</li>}
              </ul>
            </>
          ) : (
            <>
              <h2 className="font-semibold">Légende</h2>
              <ul className="space-y-1">
                {(Object.keys(COULEUR) as Etat2[]).map((e) => (
                  <li key={e} className="flex items-center gap-2"><Dot etat={e} /> {LIBELLE[e]}</li>
                ))}
              </ul>
              <p className="text-muted">
                💧 à arroser · ⚠️ valeur hors seuil. Cliquez sur un carré pour voir ses plants.
                {nonPlaces > 0 && " Des éléments ne sont pas encore placés : « Modifier le plan »."}
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

function Dot({ etat }: { etat: Etat2 }) {
  return <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: COULEUR[etat] }} title={LIBELLE[etat]} />;
}

function Badge({ etat }: { etat: Etat2 }) {
  return (
    <span className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-black/5 px-2 py-0.5 text-xs dark:bg-white/10">
      <Dot etat={etat} /> {LIBELLE[etat]}
    </span>
  );
}

function EditRow(props: {
  label: string; placed: boolean; active: boolean; bold?: boolean;
  onSelect: () => void; onPlace: () => void; onRemove: () => void;
}) {
  return (
    <div className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 ${props.active ? "bg-green-100 dark:bg-green-900/30" : ""}`}>
      <button className={`truncate text-left ${props.bold ? "font-medium" : ""} ${props.placed ? "" : "text-muted"}`} onClick={props.onSelect} disabled={!props.placed}>
        {props.label}{!props.placed && " (non placé)"}
      </button>
      <span className="flex shrink-0 gap-1">
        <button className="rounded border border-border px-2 text-xs hover:bg-black/5" onClick={props.onPlace}>{props.placed ? "Redessiner" : "Placer"}</button>
        {props.placed && <button className="rounded border border-border px-2 text-xs hover:bg-black/5" onClick={props.onRemove} title="Retirer du plan">✕</button>}
      </span>
    </div>
  );
}
