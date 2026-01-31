import type React from "react";
import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ReduxProvider } from "@/providers/ReduxProvider";
import QueryClientProvider from "@/providers/QueryClientProvider";
import { CountProvider } from "@/providers/CountProvider";
import { Suspense } from "react";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { Toaster } from "@/components/ui/toaster";
import Sidebar from "@/components/layout/Sidebar";
import MaintenanceBanner from "@/components/layout/MaintenanceBanner";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "Movrr - Transform Your Ride, Transform Your City",
  description:
    "Join the movement. Earn money while cycling and transform city streets into a canvas for brands. Flexible hours, reliable pay, and make an impact.",
  keywords:
    "bike advertising, cycling jobs, gig economy, urban mobility, brand advertising",
  authors: [{ name: "Movrr" }],
  openGraph: {
    title: "Movrr - Transform Your Ride, Transform Your City",
    description:
      "Join the movement. Earn money while cycling and transform city streets into a canvas for brands.",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Movrr - Transform Your Ride, Transform Your City",
    description:
      "Join the movement. Earn money while cycling and transform city streets into a canvas for brands.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ReduxProvider>
      <QueryClientProvider>
        <html
          lang="en"
          className={`${inter.variable} ${jetbrainsMono.variable} antialiased scroll-smooth`}
        >
          <body className="min-h-screen bg-background text-foreground">
            <CountProvider>
              <div className="flex h-screen">
                <Sidebar />
                <div className="flex-1 flex flex-col overflow-y-auto">
                  <div className="flex-1 flex flex-col">
                    <Navbar />
                    <MaintenanceBanner />
                    {/* Main content area with suspense for lazy loading */}
                    <Suspense>
                      <main className="flex-1">{children}</main>
                    </Suspense>
                    <Footer />
                  </div>
                </div>
              </div>
            </CountProvider>
            <Toaster />
            <Analytics />
          </body>
        </html>
      </QueryClientProvider>
    </ReduxProvider>
  );
}
