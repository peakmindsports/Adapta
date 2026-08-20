import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Adapta · Docencia a medida",
  description: "Crea adaptaciones curriculares y proyectos interdisciplinares con ayuda de IA.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
