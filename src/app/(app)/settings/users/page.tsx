import { addUser, deleteUser } from "@/app/actions/auth";
import { listUsers, requireAdmin } from "@/lib/auth";

const ERR: Record<string, string> = {
  "1": "Email requis et mot de passe de 8 caractères minimum.",
  "2": "Cet email existe déjà.",
  "3": "Vous ne pouvez pas supprimer votre propre compte.",
};

export default async function UsersPage({ searchParams }: PageProps<"/settings/users">) {
  const me = await requireAdmin();
  const sp = await searchParams;
  const err = typeof sp.err === "string" ? ERR[sp.err] : null;
  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Utilisateurs</h1>
      {err && <p className="rounded-lg bg-red-100 p-2 text-sm text-red-700">{err}</p>}
      <div className="card divide-y divide-border">
        {listUsers().map((u) => (
          <div key={u.id} className="flex items-center justify-between py-2">
            <div>
              <div className="font-medium">{u.nom} {u.id === me.id && <span className="text-xs text-muted">(vous)</span>}</div>
              <div className="text-sm text-muted">{u.email} · {u.role === "admin" ? "administrateur" : "utilisateur"}</div>
            </div>
            {u.id !== me.id && (
              <form action={deleteUser}>
                <input type="hidden" name="id" value={u.id} />
                <button className="btn-danger">Supprimer</button>
              </form>
            )}
          </div>
        ))}
      </div>
      <form action={addUser} className="card grid grid-cols-2 gap-3">
        <h2 className="col-span-2 font-semibold">Ajouter un utilisateur</h2>
        <input name="nom" placeholder="Nom" className="input" />
        <input name="email" type="email" placeholder="Email" required className="input" />
        <input name="password" type="password" placeholder="Mot de passe (8 min.)" minLength={8} required className="input" />
        <select name="role" className="input">
          <option value="user">Utilisateur</option>
          <option value="admin">Administrateur</option>
        </select>
        <button className="btn col-span-2">Ajouter</button>
      </form>
    </div>
  );
}
