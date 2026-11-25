import { redirect } from "next/navigation";
import { setupAdmin } from "../actions/auth";
import { userCount } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function SetupPage({ searchParams }: PageProps<"/setup">) {
  if (userCount() > 0) redirect("/login");
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={setupAdmin} className="card w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">🌱 Bienvenue !</h1>
        <p className="text-sm text-muted">Créez le compte administrateur pour démarrer.</p>
        {sp.err && <p className="rounded-lg bg-red-100 p-2 text-sm text-red-700">Email requis et mot de passe de 8 caractères minimum.</p>}
        <div>
          <label className="label" htmlFor="nom">Nom</label>
          <input id="nom" name="nom" className="input" />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">Mot de passe (8 caractères min.)</label>
          <input id="password" name="password" type="password" minLength={8} required className="input" />
        </div>
        <button className="btn w-full">Créer le compte</button>
      </form>
    </main>
  );
}
