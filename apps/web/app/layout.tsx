import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { LogDialogProvider } from "@/components/log/log-dialog";
import { SiteHeader } from "@/components/site-header";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "After the Last Listen", template: "%s · After the Last Listen" },
  description: "An album diary.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <LogDialogProvider>
          <SiteHeader />
          {children}
        </LogDialogProvider>
      </body>
    </html>
  );
}
