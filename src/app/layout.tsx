import type { Metadata } from "next";
import { Inter, Noto_Sans_Thai } from "next/font/google";
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
  icons: {
    icon: "/logo.jpg",
  },
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
        {children}
      </body>
    </html>
  );
}
