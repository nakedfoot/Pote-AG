import { notFound } from "next/navigation";
import PlantForm from "@/components/PlantForm";
import { getPlant, listCarres, listZones, plantAssoc } from "@/lib/queries";
import { hasOpbCredentials } from "@/lib/settings";

export default async function EditPlantPage({ params }: PageProps<"/plants/[id]/edit">) {
  const { id } = await params;
  const plant = getPlant(Number(id));
  if (!plant) notFound();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Modifier « {plant.nom} »</h1>
      <PlantForm plant={plant} zones={listZones()} carres={listCarres()} hasOpbKey={hasOpbCredentials()} assoc={plantAssoc(plant.id)} />
    </div>
  );
}
