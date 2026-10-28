import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./comfort.css";
import "./wellness.css";
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
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#171d25" },
  ],
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem('pe.theme');document.documentElement.dataset.theme=t==='dark'?'dark':'light'}catch(e){document.documentElement.dataset.theme='light'}`,
          }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
