import { MqttForm } from "@/components/SettingsForms";
import { requireAdmin } from "@/lib/auth";
import { getMqttStatus, listCapteursLive } from "@/lib/mqtt-service";
import { getMqttSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function MqttPage() {
  await requireAdmin();
  const { password, ...rest } = getMqttSettings();
  const status = getMqttStatus();
  const nb = listCapteursLive().length;
  const label = !status.configured
    ? "⚪ Non configuré"
    : status.connected
      ? `🟢 Connecté · ${nb} capteur(s) détecté(s)${status.publishedAt ? ` · ${status.plantsPublished} plant(s) publié(s)` : ""}`
      : `🔴 Déconnecté${status.error ? ` — ${status.error}` : ""}`;
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-semibold">Connexion MQTT</h1>
      <p className="card text-sm">{label}</p>
      <MqttForm v={{ ...rest, hasPassword: password !== "" }} />
    </div>
  );
}
