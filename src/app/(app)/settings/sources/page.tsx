import { CompleterPlantsForm, SourcesForm } from "@/components/SettingsForms";
import { requireAdmin } from "@/lib/auth";
import { getOpbSettings, getSourcesSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SourcesPage() {
  await requireAdmin();
  const opb = getOpbSettings();
  const s = getSourcesSettings();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">🌿 Sources botaniques</h1>
        <p className="text-sm text-muted">Optionnelles : elles préremplissent le calendrier (plantation, floraison, fructification, dormance…), les caractéristiques et les seuils des plants.</p>
      </div>
      <SourcesForm
        v={{
          order: s.order,
          enabled: s.enabled,
          opbClientId: opb.clientId,
          hasOpbSecret: opb.clientSecret !== "",
          hasTrefleToken: s.trefleToken !== "",
          hasPerenualKey: s.perenualKey !== "",
          inatPlaceId: s.inatPlaceId,
        }}
      />
      <CompleterPlantsForm />
    </div>
  );
}
