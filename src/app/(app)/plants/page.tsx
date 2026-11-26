import { redirect } from "next/navigation";

// La liste des plants n'existe plus : ils sont accessibles depuis l'accueil et la vue potager.
export default function PlantsPage() {
  redirect("/");
}
