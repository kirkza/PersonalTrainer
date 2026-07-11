import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import BottomNav from "@/components/BottomNav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Personal Fitness Trainer",
  description: "Adaptive workout plans, logging, and progress tracking",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0f14",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <div className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-4">
          {children}
        </div>
        <footer className="pb-20 pt-2 text-center text-[10px] text-muted">
          Exercise media © Gym visual · data from{" "}
          <a
            href="https://github.com/hasaneyldrm/exercises-dataset"
            className="underline"
          >
            exercises-dataset
          </a>
        </footer>
        <BottomNav />
      </body>
    </html>
  );
}
