import { OpbForm } from "@/components/SettingsForms";
import { requireAdmin } from "@/lib/auth";
import { getOpbSettings } from "@/lib/settings";

export default async function OpbPage() {
  await requireAdmin();
  const { clientId, clientSecret } = getOpbSettings();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">OpenPlantbook</h1>
      <p className="text-sm text-muted">Optionnel : permet de rechercher une plante et de préremplir ses besoins (lumière, humidité, température…).</p>
      <OpbForm clientId={clientId} hasSecret={clientSecret !== ""} />
    </div>
  );
}
