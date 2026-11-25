"use client";

import { useEffect } from "react";

/** Enregistre le service worker (HTTPS ou localhost uniquement, sinon le navigateur l'ignore). */
export default function RegisterSW() {
  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
