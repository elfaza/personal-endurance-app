import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Personal Endurance", template: "%s · Personal Endurance" },
  description:
    "Your personal running and cycling training space. Every session counts.",
  applicationName: "Personal Endurance",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Endurance",
  },
  icons: { icon: "/icon.svg", apple: "/apple-touch-icon.png" },
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#101312",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
