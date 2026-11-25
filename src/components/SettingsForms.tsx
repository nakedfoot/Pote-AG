"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { saveMqtt, testMqtt, republishMqtt, saveOpb, testOpb, type ActionResult } from "@/app/actions/settings";

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

export function OpbForm({ clientId, hasSecret }: { clientId: string; hasSecret: boolean }) {
  const { result, pending, run, router } = useFormActions();
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        run(form, saveOpb, () => {
          const pw = form.elements.namedItem("clientSecret");
          if (pw instanceof HTMLInputElement) pw.value = "";
          router.refresh();
        });
      }}
      className="card max-w-xl space-y-4"
    >
      <Field label="Client ID" hint="Disponible gratuitement dans votre compte sur open.plantbook.io (API credentials).">
        <input name="clientId" defaultValue={clientId} autoComplete="off" className="input" required />
      </Field>
      <Field label="Client Secret" hint={hasSecret ? "Un secret est enregistré. Laisser vide pour le conserver." : undefined}>
        <input name="clientSecret" type="password" autoComplete="new-password" placeholder={hasSecret ? "••••••••••••" : ""} className="input" />
      </Field>
      <Result r={result} />
      <div className="flex gap-3">
        <button className="btn" disabled={pending}>{pending ? "Veuillez patienter…" : "Enregistrer"}</button>
        <button type="button" onClick={(e) => run(e.currentTarget.form, testOpb)} className="btn-secondary" disabled={pending}>
          Tester les identifiants
        </button>
      </div>
    </form>
  );
}
