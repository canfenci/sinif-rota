import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

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
    openGraph: { title, description, images: [{ url: image, width: 1536, height: 912, alt: "Sınıf Rota" }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="tr"><body>{children}</body></html>;
}
