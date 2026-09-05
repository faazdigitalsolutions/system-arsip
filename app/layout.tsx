import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "SYTEM ARSIP",
  description:
    "SYTEM ARSIP — Sistem Manajemen Arsip Digital modern untuk mengelola surat masuk, surat keluar, dokumen keuangan, dan kontrak secara terpusat.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <html lang="id">
      <body className="bg-slate-50 text-slate-800 antialiased">{children}</body>
    </html>
  );
}