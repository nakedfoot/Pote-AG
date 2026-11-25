import { redirect } from "next/navigation";
import { login } from "../actions/auth";
import { userCount } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (userCount() === 0) redirect("/setup");
  const sp = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <form action={login} className="card w-full max-w-sm space-y-4">
        <h1 className="text-2xl font-semibold">🌱 Potager</h1>
        {sp.err && <p className="rounded-lg bg-red-100 p-2 text-sm text-red-700">Email ou mot de passe incorrect.</p>}
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" required autoFocus className="input" />
        </div>
        <div>
          <label className="label" htmlFor="password">Mot de passe</label>
          <input id="password" name="password" type="password" required className="input" />
        </div>
        <button className="btn w-full">Se connecter</button>
      </form>
    </main>
  );
}
