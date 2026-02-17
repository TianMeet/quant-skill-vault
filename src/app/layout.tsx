import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";
import { ChatProvider } from "@/lib/chat/chat-context";
import { ChatPanel } from "@/components/chat-panel";
import { ThemeProvider } from "@/lib/theme-context";

export const metadata: Metadata = {
  title: "Skill 管理平台",
  description: "Skill 协议管理平台",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className="antialiased min-h-screen"
        style={{ background: 'var(--background)', color: 'var(--foreground)' }}
      >
        <ThemeProvider>
          <ChatProvider>
            <Nav />
            <main className="pt-2">{children}</main>
            <ChatPanel />
          </ChatProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
