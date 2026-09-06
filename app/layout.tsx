import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { ServiceWorkerRegister } from "./components/ServiceWorkerRegister";
import "./globals.css";

export const viewport: Viewport = {
  themeColor: "#3F5FCE",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const image = `${protocol}://${host}/og.png`;
  const title = "Sınıf Rota — Hızlı sınıf kontrolü";
  const description = "Öğretmenler için minimum dokunuşla hızlı ödev, defter, kitap ve materyal takibi.";
  return {
    title,
    description,
    manifest: "/manifest.webmanifest",
    appleWebApp: {
      capable: true,
      statusBarStyle: "default",
      title: "Sınıf Rota",
    },
    icons: {
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
      icon: [
        { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
        { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      ],
    },
    openGraph: { title, description, images: [{ url: image, width: 1536, height: 912, alt: "Sınıf Rota" }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
