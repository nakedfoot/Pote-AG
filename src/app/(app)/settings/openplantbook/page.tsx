import { redirect } from "next/navigation";

// Ancienne page : OpenPlantbook est désormais réglé avec les autres sources.
export default function OpbPage() {
  redirect("/settings/sources");
}
