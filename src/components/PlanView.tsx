"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { savePlan, savePlanEchelle, supprimerPlan, uploadPlan } from "@/app/actions/plan";
import AutoRefresh from "@/components/AutoRefresh";
import CarreDessus from "@/components/CarreDessus";
import Zoomable from "@/components/Zoomable";
import { DEFAUT_CARRE_CM, formatDimensions } from "@/lib/carres";

export type Rect = { x: number; y: number; w: number; h: number }; // fractions (0..1) de l'image
export type Etat2 = "ok" | "bas" | "haut" | "inconnu" | "vide";
export type PlantInfo = { id: number; nom: string; variete: string | null; etat: Etat2; aArroser: boolean; batterieBasse: boolean };
export type ZoneItem = { id: number; nom: string; couleur: string; rect: Rect | null; etat: Etat2 };
export type CarreItem = {
  id: number; zone_id: number; nom: string; rect: Rect | null; etat: Etat2; plants: PlantInfo[];
  /** Dimensions réelles (cm) et rotation sur le plan (degrés, sens horaire) */
  longueur: number | null; largeur: number | null; rot: number;
};

const COULEUR: Record<Etat2, string> = { ok: "#16a34a", bas: "#f59e0b", haut: "#dc2626", inconnu: "#6b7280", vide: "#94a3b8" };
const LIBELLE: Record<Etat2, string> = { ok: "OK", bas: "Trop bas", haut: "Trop haut", inconnu: "Pas de mesure", vide: "Aucun plant" };
const MIN = 0.02;
/** Largeur réelle supposée de l'image tant que l'échelle n'est pas renseignée (cm) */
const ECHELLE_DEFAUT_CM = 2000;
const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));

type Drag = { key: string; mode: "move" | "resize"; sx: number; sy: number; orig: Rect };
type Ghost = { id: number; sx: number; sy: number; x: number; y: number; moved: boolean };

export default function PlanView({ version, zones, carres, echelleCm }: { version: number | null; zones: ZoneItem[]; carres: CarreItem[]; echelleCm: number | null }) {
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
  const [rots, setRots] = useState<Record<number, number>>(() => Object.fromEntries(carres.map((c) => [c.id, c.rot])));
  const [ratio, setRatio] = useState(1.5); // largeur / hauteur de l'image
  const [ghost, setGhost] = useState<Ghost | null>(null);
  const [largeurM, setLargeurM] = useState(echelleCm ? String(Number((echelleCm / 100).toFixed(2))) : "");
  const [echMsg, setEchMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [failed, setFailed] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<Drag | null>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const ghostRef = useRef(ghost);
  const rectsRef = useRef(rects);
  const rotsRef = useRef(rots);
  const echelle = echelleCm ?? ECHELLE_DEFAUT_CM;

  /** Taille d'un carré sur le plan (fractions de l'image), à l'échelle : longueur réelle / largeur réelle de l'image. */
  const tailleCarre = (c: CarreItem) => {
    const l = c.longueur ?? DEFAUT_CARRE_CM, w = c.largeur ?? DEFAUT_CARRE_CM;
    return { w: Math.min(1, l / echelle), h: Math.min(1, (w / echelle) * ratio) };
  };
  /** Rectangle d'un carré placé, ramené dans l'image. */
  const rectCarre = (c: CarreItem, base: Rect | null | undefined): Rect | null => {
    if (!base) return null;
    const t = tailleCarre(c);
    return { x: clamp(base.x, 0, 1 - t.w), y: clamp(base.y, 0, 1 - t.h), ...t };
  };

  const pos = (e: React.PointerEvent) => {
    const b = box.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - b.left) / b.width), y: clamp((e.clientY - b.top) / b.height) };
  };
  useEffect(() => {
    ghostRef.current = ghost;
    rectsRef.current = rects;
    rotsRef.current = rots;
  }, [ghost, rects, rots]);
  const setRect = (key: string, r: Rect | null) => {
    setRects((prev) => ({ ...prev, [key]: r }));
    setDirty(true);
    setFailed(false);
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
  const startDrag = (e: React.PointerEvent, key: string, mode: Drag["mode"], over?: Rect) => {
    const orig = over ?? rects[key];
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
    setFailed(false);
    setMsg(null);
  };
  const endDrag = () => {
    drag.current = null;
  };

  // ---- Glisser un carré depuis la liste (ou depuis le plan vers la liste pour le retirer) ----
  const ghostActif = ghost !== null;
  useEffect(() => {
    if (!ghostActif) return;
    const move = (e: PointerEvent) =>
      setGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY, moved: g.moved || Math.hypot(e.clientX - g.sx, e.clientY - g.sy) > 5 } : g));
    const up = (e: PointerEvent) => {
      const g = ghostRef.current;
      setGhost(null);
      if (!g?.moved || !box.current) return;
      const c = carres.find((x) => x.id === g.id);
      if (!c) return;
      const b = box.current.getBoundingClientRect();
      const dansPlan = e.clientX >= b.left && e.clientX <= b.right && e.clientY >= b.top && e.clientY <= b.bottom;
      if (dansPlan) {
        // Le carré se centre sur le point de dépôt
        const t = tailleCarre(c);
        const x = clamp((e.clientX - b.left) / b.width - t.w / 2, 0, 1 - t.w);
        const y = clamp((e.clientY - b.top) / b.height - t.h / 2, 0, 1 - t.h);
        setRect(`c${c.id}`, { x, y, ...t });
        setSelected(`c${c.id}`);
      } else if (document.elementsFromPoint(e.clientX, e.clientY).some((el) => el instanceof HTMLElement && el.dataset.dropListe !== undefined)) {
        setRect(`c${c.id}`, null);
      }
    };
    const cancel = () => setGhost(null);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ghostActif]);

  const startGhost = (e: React.PointerEvent, id: number) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    setGhost({ id, sx: e.clientX, sy: e.clientY, x: e.clientX, y: e.clientY, moved: false });
  };

  const tourner = (c: CarreItem) => {
    setRots((r) => ({ ...r, [c.id]: ((r[c.id] ?? 0) + 90) % 360 }));
    setDirty(true);
    setFailed(false);
    setMsg(null);
  };

  /** Rotation libre : la poignée suit le pointeur autour du centre du carré (pas de 5°). */
  const tournerVers = (e: React.PointerEvent, c: CarreItem, r: Rect) => {
    if (e.buttons === 0 || !box.current) return;
    const b = box.current.getBoundingClientRect();
    const cx = b.left + (r.x + r.w / 2) * b.width, cy = b.top + (r.y + r.h / 2) * b.height;
    const deg = (Math.atan2(e.clientX - cx, cy - e.clientY) * 180) / Math.PI;
    const rot = ((Math.round(deg / 5) * 5) % 360 + 360) % 360;
    setRots((p) => (p[c.id] === rot ? p : { ...p, [c.id]: rot }));
    setDirty(true);
    setFailed(false);
    setMsg(null);
  };

  const enregistrerEchelle = () => {
    const m = Number(largeurM.replace(",", "."));
    if (!Number.isFinite(m) || m <= 0) {
      setEchMsg({ ok: false, text: "Indiquez une largeur en mètres." });
      return;
    }
    start(async () => {
      try {
        const r = await savePlanEchelle(Math.round(m * 100));
        setEchMsg({ ok: r.ok, text: r.ok ? "✓ Échelle enregistrée" : r.message });
        if (r.ok) {
          setDirty(true); // les carrés changent de taille : on réenregistre leurs dimensions
        }
      } catch {
        setEchMsg({ ok: false, text: "Enregistrement impossible. Réessayez." });
      }
    });
  };

  const enregistrer = () => {
    const entries = [
      ...zones.map((z) => ({ type: "zone", id: z.id, rect: rects[`z${z.id}`] ?? null })),
      ...carres.map((c) => ({ type: "carre", id: c.id, rect: rectCarre(c, rects[`c${c.id}`]), rot: rots[c.id] ?? 0 })),
    ];
    setDirty(false); // si on modifie encore pendant l'envoi, dirty repasse à true et un nouvel envoi suivra
    start(async () => {
      try {
        const r = await savePlan(JSON.stringify(entries));
        setMsg({ ok: r.ok, text: r.ok ? "✓ Plan enregistré" : r.message });
        if (!r.ok) setFailed(true);
      } catch {
        setMsg({ ok: false, text: "Enregistrement impossible (connexion perdue ou session expirée). Réessayez." });
        setFailed(true);
      }
    });
  };

  // Enregistrement automatique 0,7 s après la dernière modification (tracé, déplacement, retrait).
  useEffect(() => {
    if (!dirty || pending) return;
    const t = setTimeout(enregistrer, 700);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dirty, pending, rects, rots]);

  // Évite de quitter la page avec une modification encore en cours d'envoi.
  useEffect(() => {
    if (!dirty && !pending) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty, pending]);

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
          <input type="file" name="plan" accept="image/*" required className="max-w-full text-sm" />
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
        {/* État de l'enregistrement : visible aussi en mode « Consulter » */}
        {pending ? (
          <span className="text-sm text-muted">Enregistrement…</span>
        ) : dirty ? (
          <span className="text-sm text-amber-700">Modification en cours d&apos;enregistrement…</span>
        ) : (
          msg && <span className={`text-sm ${msg.ok ? "text-green-700" : "text-red-700"}`}>{msg.text}</span>
        )}
        {failed && !pending && <button className="btn" onClick={enregistrer}>Réessayer</button>}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ---- Plan (zoomable : le plan reste en place dans la grille, sa hauteur ne dépend pas de celle du panneau) ---- */}
        <Zoomable wide className="">
        <div
          ref={box}
          className="relative select-none overflow-hidden rounded-xl border border-border"
          onClick={() => !edit && setSelected(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/plan?v=${version}`}
            alt="Plan du jardin"
            draggable={false}
            className="block h-auto w-full"
            ref={(el) => {
              if (el?.complete && el.naturalWidth) setRatio((r) => (r === el.naturalWidth / el.naturalHeight ? r : el.naturalWidth / el.naturalHeight));
            }}
            onLoad={(e) => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)}
          />

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
                    className="absolute -bottom-1.5 -right-1.5 h-5 w-5 cursor-nwse-resize rounded-full border-2 border-white bg-green-700"
                    style={{ touchAction: "none" }}
                    onPointerDown={(e) => startDrag(e, key, "resize")}
                  />
                )}
              </div>
            );
          })}

          {carres.map((c) => {
            const key = `c${c.id}`;
            const r = rectCarre(c, rects[key]);
            if (!r) return null;
            const col = COULEUR[c.etat];
            const alerte = c.plants.filter((p) => p.etat === "bas" || p.etat === "haut").length;
            const arroser = c.plants.some((p) => p.aArroser);
            return (
              <div
                key={key}
                style={{ ...rectStyle(r), transform: `rotate(${rots[c.id] ?? 0}deg)`, touchAction: edit ? "none" : "auto" }}
                className={`absolute ${selected === key ? "z-30" : "z-20"} ${edit && !arm ? "cursor-move" : "cursor-pointer"}`}
                onPointerDown={(e) => startDrag(e, key, "move", r)}
                onPointerMove={onDragMove}
                onPointerUp={endDrag}
                onClick={(e) => { e.stopPropagation(); setSelected(key); }}
                title={`${c.nom} — ${formatDimensions(c.longueur, c.largeur, null) ?? "dimensions non renseignées"} — ${LIBELLE[c.etat]}`}
              >
                {/* Carré vu du dessus (cadre en bois et terre), contour coloré selon l'état des plants */}
                <div className="pointer-events-none absolute inset-0 rounded-sm" style={{ boxShadow: `0 0 0 2px ${col}${selected === key ? "" : "cc"}, 0 0 0 4px ${selected === key ? "#fff" : "transparent"}` }}>
                  <CarreDessus longueur={c.longueur} largeur={c.largeur} fill />
                </div>
                <span
                  className="pointer-events-none absolute left-1/2 top-1/2 max-w-[90%] truncate rounded bg-black/60 px-1 text-center text-[11px] font-medium leading-4 text-white"
                  style={{ transform: `translate(-50%, -50%) rotate(${-(rots[c.id] ?? 0)}deg)` }}
                >
                  {c.nom}{c.plants.length > 0 && ` · ${c.plants.length}`}{arroser && " 💧"}{alerte > 0 && " ⚠️"}
                </span>
                {edit && selected === key && !arm && (
                  <>
                    <span className="pointer-events-none absolute -top-5 left-1/2 h-5 w-px bg-white/90" />
                    <span
                      title="Tourner"
                      className="absolute -top-8 left-1/2 flex h-6 w-6 -translate-x-1/2 cursor-grab items-center justify-center rounded-full border-2 border-white bg-green-700 text-[11px] text-white shadow"
                      style={{ touchAction: "none" }}
                      onPointerDown={(e) => { e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); }}
                      onPointerMove={(e) => tournerVers(e, c, r)}
                    >↻</span>
                  </>
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
        </Zoomable>

        {/* ---- Panneau latéral ---- */}
        <aside data-drop-liste className="card space-y-3 self-start text-sm">
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
                  Glissez un carré de la liste sur le plan : il y est dessiné à l&apos;échelle. Déplacez-le ensuite directement sur le plan. Pour une zone, cliquez « Placer » puis tracez son rectangle (poignée verte pour la redimensionner). Les modifications sont enregistrées automatiquement.
                </p>
              )}
              <div className="space-y-1 rounded-lg bg-black/5 p-2 dark:bg-white/5">
                <label className="font-medium" htmlFor="plan-largeur">Largeur réelle de l&apos;image (m)</label>
                <div className="flex gap-2">
                  <input id="plan-largeur" value={largeurM} onChange={(e) => setLargeurM(e.target.value)} inputMode="decimal" placeholder="ex. 15" className="input min-w-0 flex-1" />
                  <button className="btn-secondary" onClick={enregistrerEchelle} disabled={pending}>OK</button>
                </div>
                <p className="text-xs text-muted">
                  Distance réelle d&apos;un bord à l&apos;autre du plan : les carrés sont dessinés à leurs dimensions réelles.
                  {!echelleCm && " Non renseignée : 20 m sont supposés."}
                  {echelleCm && ratio > 0 && ` Hauteur déduite : ${Number(((echelleCm / ratio) / 100).toFixed(1))} m.`}
                </p>
                {echMsg && <p className={`text-xs ${echMsg.ok ? "text-green-700" : "text-red-700"}`}>{echMsg.text}</p>}
              </div>
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
                          <div className={`flex items-center justify-between gap-2 rounded-lg px-2 py-1 ${selected === `c${c.id}` ? "bg-green-100 dark:bg-green-900/30" : ""} ${ghost?.id === c.id && ghost.moved ? "opacity-40" : ""}`}>
                            <div
                              onPointerDown={(e) => startGhost(e, c.id)}
                              style={{ touchAction: "none" }}
                              className="min-w-0 flex-1 cursor-grab select-none active:cursor-grabbing"
                              title="Glisser sur le plan"
                            >
                              <span className={`block truncate ${rects[`c${c.id}`] ? "" : "text-muted"}`}>⠿ {c.nom}{!rects[`c${c.id}`] && " (non placé)"}</span>
                              <span className="block truncate text-xs text-muted">{formatDimensions(c.longueur, c.largeur, null) ?? "dimensions non renseignées"}</span>
                            </div>
                            <span className="flex shrink-0 gap-1">
                              <button className="rounded border border-border px-2 text-xs hover:bg-black/5" onClick={() => tourner(c)} title="Tourner de 90° (ou glisser la poignée ↻ sur le plan)">↻</button>
                              {rects[`c${c.id}`] && (
                                <button className="rounded border border-border px-2 text-xs hover:bg-black/5" onClick={() => { setRect(`c${c.id}`, null); setSelected(null); }} title="Retirer du plan">✕</button>
                              )}
                            </span>
                          </div>
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
      {ghost?.moved && (
        <div className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2 rounded-lg border-2 border-amber-700 bg-amber-200/90 px-3 py-1 text-sm font-medium shadow-xl" style={{ left: ghost.x, top: ghost.y }}>
          {carres.find((c) => c.id === ghost.id)?.nom}
        </div>
      )}
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
