import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Thai } from "next/font/google";
import { SwRegister } from "@/components/sw-register";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const notoThai = Noto_Sans_Thai({
  variable: "--font-noto-thai",
  subsets: ["thai", "latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "LOOKMEE Check In-Out | Student Attendance System",
  description: "ระบบเช็กชื่อนักเรียนด้วยใบหน้า - LOOKMEE Check In-Out",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "LOOKMEE",
    statusBarStyle: "default",
  },
  icons: {
    icon: [
      { url: "/logo.jpg" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#16233a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th" className="h-full">
      <body
        className={`${inter.variable} ${notoThai.variable} min-h-full font-sans`}
      >
        <SwRegister />
        {children}
      </body>
    </html>
  );
}
