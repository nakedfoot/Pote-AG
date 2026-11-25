import PlantForm from "@/components/PlantForm";
import { listCarres, listZones } from "@/lib/queries";
import { hasOpbCredentials } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default function NewPlantPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">➕ Nouveau plant</h1>
      <PlantForm zones={listZones()} carres={listCarres()} hasOpbKey={hasOpbCredentials()} assoc={{}} />
    </div>
  );
}
