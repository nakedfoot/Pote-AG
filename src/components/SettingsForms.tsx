"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  completerPlants, republishMqtt, saveMqtt, saveSources, testInatAction, testMqtt, testOpb, testPerenualAction, testTrefleAction,
  type ActionResult,
} from "@/app/actions/settings";
import { PROVIDERS, type ProviderId } from "@/lib/botanique";

type MqttView = {
  host: string; port: number | null; tls: boolean; username: string; hasPassword: boolean;
  z2mBaseTopic: string; publishPrefix: string; haDiscovery: boolean; haDiscoveryPrefix: string;
  imageMode: "url" | "base64" | "both"; imageMaxKb: number; publicUrl: string;
};

function Result({ r }: { r: ActionResult | null }) {
  if (!r) return null;
  return (
    <p className={`rounded-lg p-2 text-sm ${r.ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>
      {r.message}
    </p>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

type Act = (prev: ActionResult | null, f: FormData) => Promise<ActionResult>;

/**
 * Exécute des actions serveur sans `<form action>` : React 19 réinitialise les champs
 * d'un formulaire après une action, ce qui effaçait la saisie après un test ou un enregistrement.
 */
function useFormActions() {
  const router = useRouter();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const run = (form: HTMLFormElement | null, action: Act, afterOk?: () => void) => {
    if (!form || !form.reportValidity()) return;
    const data = new FormData(form);
    start(async () => {
      const r = await action(null, data);
      setResult(r);
      if (r.ok && afterOk) afterOk();
    });
  };
  return { result, pending, run, router };
}

export function MqttForm({ v }: { v: MqttView }) {
  const { result, pending, run, router } = useFormActions();
  const after = (form: HTMLFormElement | null) => () => {
    const pw = form?.elements.namedItem("password");
    if (pw instanceof HTMLInputElement) pw.value = ""; // le mot de passe est enregistré, on ne le garde pas à l'écran
    router.refresh(); // met à jour l'état de connexion affiché
  };
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(e.currentTarget, saveMqtt, after(e.currentTarget));
      }}
      className="space-y-6"
    >
      <section className="card space-y-4">
        <h2 className="font-semibold">Serveur MQTT</h2>
        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-2"><Field label="Adresse"><input name="host" defaultValue={v.host} placeholder="192.168.1.10" className="input" required /></Field></div>
          <Field label="Port (facultatif)" hint="Vide = aucun port dans l'URL.">
            <input name="port" type="number" defaultValue={v.port ?? ""} placeholder="1883" className="input" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="tls" defaultChecked={v.tls} /> Connexion sécurisée (TLS)</label>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Identifiant"><input name="username" defaultValue={v.username} autoComplete="off" className="input" /></Field>
          <Field label="Mot de passe" hint={v.hasPassword ? "Laisser vide pour conserver l'actuel." : undefined}>
            <input name="password" type="password" autoComplete="new-password" placeholder={v.hasPassword ? "••••••••" : ""} className="input" />
          </Field>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">Topics</h2>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Topic de base Zigbee2MQTT" hint="Celui de Zigbee2MQTT (base_topic).">
            <input name="z2mBaseTopic" defaultValue={v.z2mBaseTopic} className="input" />
          </Field>
          <Field label="Préfixe de publication" hint="Objet complet publié sur <préfixe>/plant/<id>/state (zone et carré sont dans le message).">
            <input name="publishPrefix" defaultValue={v.publishPrefix} className="input" />
          </Field>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">Home Assistant</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="haDiscovery" defaultChecked={v.haDiscovery} />
          Publier la découverte automatique (MQTT Discovery) : chaque plant apparaît comme appareil dans Home Assistant
        </label>
        <Field label="Préfixe de découverte" hint="Doit correspondre à celui de l'intégration MQTT de Home Assistant (par défaut « homeassistant »).">
          <input name="haDiscoveryPrefix" defaultValue={v.haDiscoveryPrefix} className="input max-w-xs" />
        </Field>
      </section>

      <section className="card space-y-4">
        <h2 className="font-semibold">Image dans le message</h2>
        <Field label="Mode">
          <select name="imageMode" defaultValue={v.imageMode} className="input max-w-sm">
            <option value="url">URL seule</option>
            <option value="base64">Base64 seul (miniature)</option>
            <option value="both">URL + base64</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Taille max de la miniature base64 (Ko)"><input name="imageMaxKb" type="number" defaultValue={v.imageMaxKb} className="input" /></Field>
          <Field label="URL publique de l'application" hint="Sert à construire le lien de l'image.">
            <input name="publicUrl" defaultValue={v.publicUrl} placeholder="http://potager.local:3000" className="input" />
          </Field>
        </div>
      </section>

      <Result r={result} />
      <div className="flex flex-wrap gap-3">
        <button className="btn" disabled={pending}>{pending ? "Veuillez patienter…" : "Enregistrer"}</button>
        <button type="button" onClick={(e) => run(e.currentTarget.form, testMqtt)} className="btn-secondary" disabled={pending}>
          Tester la connexion
        </button>
        <button type="button" onClick={(e) => run(e.currentTarget.form, republishMqtt)} className="btn-secondary" disabled={pending} title="Republie tous les plants et la découverte Home Assistant">
          Republier tous les plants
        </button>
      </div>
    </form>
  );
}

export type SourcesView = {
  order: ProviderId[];
  enabled: Record<ProviderId, boolean>;
  opbClientId: string;
  hasOpbSecret: boolean;
  hasTrefleToken: boolean;
  hasPerenualKey: boolean;
  inatPlaceId: number | null;
};

const APPORTS: Record<ProviderId, string> = {
  openplantbook: "Seuils : température, humidité de l'air et du sol, conductivité, luminosité. Photo.",
  trefle: "Mois de floraison et de fructification, dormance (mois hors croissance), jours avant récolte, pH, températures, espacement, hauteur, exposition, cycle, parties comestibles, toxicité.",
  inaturalist: "Noms communs en français, description (Wikipédia), mois de floraison et de fructification observés localement. Sans clé.",
  perenual: "Saisons de floraison, de fructification et de récolte, mois de taille, cycle, arrosage, exposition, rusticité, hauteur, comestibilité, toxicité, description (en anglais).",
};

export function SourcesForm({ v }: { v: SourcesView }) {
  const { result, pending, run, router } = useFormActions();
  const [order, setOrder] = useState<ProviderId[]>(v.order);
  const move = (i: number, d: -1 | 1) => {
    const next = [...order];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setOrder(next);
  };
  const clearSecrets = (form: HTMLFormElement) => () => {
    for (const n of ["clientSecret", "trefleToken", "perenualKey"]) {
      const el = form.elements.namedItem(n);
      if (el instanceof HTMLInputElement) el.value = "";
    }
    router.refresh();
  };
  const test = (action: Act) => (e: React.MouseEvent<HTMLButtonElement>) => run(e.currentTarget.form, action);

  const champs: Record<ProviderId, React.ReactNode> = {
    openplantbook: (
      <div className="grid grid-cols-2 gap-3">
        <Field label="Client ID" hint="Gratuit sur open.plantbook.io (API credentials).">
          <input name="clientId" defaultValue={v.opbClientId} autoComplete="off" className="input" />
        </Field>
        <Field label="Client Secret" hint={v.hasOpbSecret ? "Enregistré. Laisser vide pour le conserver." : undefined}>
          <input name="clientSecret" type="password" autoComplete="new-password" placeholder={v.hasOpbSecret ? "••••••••••••" : ""} className="input" />
        </Field>
      </div>
    ),
    trefle: (
      <Field label="Jeton (token)" hint={v.hasTrefleToken ? "Enregistré. Laisser vide pour le conserver." : "Gratuit sur trefle.io."}>
        <input name="trefleToken" type="password" autoComplete="new-password" placeholder={v.hasTrefleToken ? "••••••••••••" : ""} className="input" />
      </Field>
    ),
    inaturalist: (
      <Field label="Lieu pour la phénologie (identifiant iNaturalist)" hint="6753 = France. Repli automatique sur l'Europe s'il y a trop peu d'observations.">
        <input name="inatPlaceId" type="number" defaultValue={v.inatPlaceId ?? ""} className="input max-w-40" />
      </Field>
    ),
    perenual: (
      <Field label="Clé d'API" hint={v.hasPerenualKey ? "Enregistrée. Laisser vide pour la conserver." : "Gratuite sur perenual.com (quota quotidien limité : les réponses sont mises en cache)."}>
        <input name="perenualKey" type="password" autoComplete="new-password" placeholder={v.hasPerenualKey ? "••••••••••••" : ""} className="input" />
      </Field>
    ),
  };
  const tests: Record<ProviderId, Act> = { openplantbook: testOpb, trefle: testTrefleAction, inaturalist: testInatAction, perenual: testPerenualAction };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(e.currentTarget, saveSources, clearSecrets(e.currentTarget));
      }}
      className="max-w-3xl space-y-4"
    >
      <p className="text-sm text-muted">
        Ordre de priorité : pour chaque champ, la première source qui fournit une valeur l&apos;emporte ; les suivantes ne servent qu&apos;à compléter les champs restés vides.
      </p>
      {order.map((p, i) => (
        <section key={p} className="card space-y-3">
          <input type="hidden" name="order" value={p} />
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-green-700 text-sm font-semibold text-white">{i + 1}</span>
              <h2 className="font-semibold">{PROVIDERS[p]}</h2>
            </div>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1 text-sm"><input type="checkbox" name={`enabled_${p}`} defaultChecked={v.enabled[p]} /> Activée</label>
              <button type="button" className="btn-secondary text-xs" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Monter">↑</button>
              <button type="button" className="btn-secondary text-xs" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label="Descendre">↓</button>
            </div>
          </div>
          <p className="text-xs text-muted">{APPORTS[p]}</p>
          {champs[p]}
          <button type="button" onClick={test(tests[p])} className="btn-secondary text-xs" disabled={pending}>Tester</button>
        </section>
      ))}
      <Result r={result} />
      <button className="btn" disabled={pending}>{pending ? "Veuillez patienter…" : "Enregistrer"}</button>
    </form>
  );
}

export function CompleterPlantsForm() {
  const { result, pending, run, router } = useFormActions();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        run(e.currentTarget, completerPlants, () => router.refresh());
      }}
      className="card max-w-3xl space-y-3"
    >
      <h2 className="font-semibold">Compléter les plants</h2>
      <p className="text-sm text-muted">
        Interroge les sources pour tous les plants et remplit les champs vides (calendrier, caractéristiques, seuils). Les valeurs saisies à la main ne sont jamais modifiées.
        Les plants sans nom scientifique sont identifiés à partir de leur nom via iNaturalist.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="rafraichir" />
        Rechercher les mises à jour : ignorer le cache et actualiser aussi les valeurs déjà issues des sources
      </label>
      <Result r={result} />
      <button className="btn" disabled={pending}>{pending ? "Interrogation des sources… (peut prendre quelques minutes)" : "Compléter les plants"}</button>
    </form>
  );
}
