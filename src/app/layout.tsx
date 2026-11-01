import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Suspense } from "react";
import { ThemeProvider } from "@/components/common/ThemeProvider";
import { CampusTimeProvider } from "@/components/common/CampusTimeProvider";
import { LanguageProvider } from "@/components/common/LanguageProvider";
import { NavigationProgressBar } from "@/components/common/NavigationProgressBar";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: "CampusFleet | Smart Campus Transport & Fleet Management System",
  description:
    "Enterprise campus fleet management system featuring reserved seat bookings, automated standby queue management, live GPS telematics, and cryptographic digital QR pass validation.",
  manifest: "/manifest.webmanifest",
  applicationName: "CampusFleet",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CampusFleet",
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};


export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#000000" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("campusfleet_theme")||localStorage.getItem("campusride_theme")||localStorage.getItem("bussync_theme");var isDark=t==="dark"||(!t&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;if(isDark){r.classList.add("dark");r.style.colorScheme="dark";}else{r.classList.remove("dark");r.style.colorScheme="light";}var m=document.querySelector('meta[name="theme-color"]');if(m){m.setAttribute("content",isDark?"#000000":"#ffffff");m.removeAttribute("media");}}catch(e){}})();`,
          }}
        />
      </head>
      <body className={inter.className}>
        <ThemeProvider>
          <LanguageProvider>
            <CampusTimeProvider>
              <Suspense fallback={null}>
                <NavigationProgressBar />
              </Suspense>
              {children}
            </CampusTimeProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
