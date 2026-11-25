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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr" className="h-full antialiased">
      <body className="min-h-full">
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
