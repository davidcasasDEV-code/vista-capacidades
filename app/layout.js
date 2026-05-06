import "./globals.css";

export const metadata = {
  title: "Vista Capacidades",
  description: "Vista Capacidades y Demanda"
};

export default function RootLayout({ children }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
