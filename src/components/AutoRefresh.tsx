"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Rafraîchit les données serveur de la page à intervalle régulier (sans perdre l'état du navigateur). */
export default function AutoRefresh({ seconds = 30 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(t);
  }, [router, seconds]);
  return null;
}
