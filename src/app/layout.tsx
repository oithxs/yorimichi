import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ClerkProvider, SignedIn, SignedOut } from "@clerk/nextjs";
import { UserSync } from "@/components/auth/user-sync";
import { Sidebar } from "@/components/sidebar";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Yorimichi",
  description: "AI-powered Git conversation platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <ClerkProvider
      appearance={{
        layout: {
          unsafe_disableDevelopmentModeWarnings: true,
          shimmer: false,
        },
      }}
      localization={{
        userButton: {
          action__manageAccount: "設定",
        },
      }}
    >
      <html lang="ja" suppressHydrationWarning>
        <body
          className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        >
          <TooltipProvider delayDuration={300}>
            <SignedIn>
              <UserSync />
            </SignedIn>

            <div className="flex min-h-screen">
              <Sidebar />
              <main className="flex-1 flex h-screen flex-col overflow-y-auto hide-scrollbar md:pl-[72px]">
                {children}
              </main>
            </div>
            <Toaster position="bottom-right" />
          </TooltipProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}