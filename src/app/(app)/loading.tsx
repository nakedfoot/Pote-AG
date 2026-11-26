/** Affiché immédiatement pendant que la page serveur se calcule : la navigation répond tout de suite. */
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy>
      <div className="h-8 w-48 rounded-lg bg-black/10 dark:bg-white/10" />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(16rem,100%),1fr))] gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-xl bg-black/5 dark:bg-white/5" />
        ))}
      </div>
    </div>
  );
}
