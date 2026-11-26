import type { Metadata, Viewport } from "next";
import RegisterSW from "@/components/RegisterSW";
import "./globals.css";

export const metadata: Metadata = {
  title: "Potager",
  description: "Gestion de potager connecté",
  applicationName: "Potager",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Potager", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#15803d",
};

/** Appliqué avant l'affichage pour éviter un flash : choix mémorisé, sinon réglage du système. */
const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("potager-theme");var d=t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;if(d)e.classList.add("dark");e.style.colorScheme=d?"dark":"light"}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
