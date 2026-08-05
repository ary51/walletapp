import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "walletapp",
  description: "Personal finance tracker",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <a href="/">walletapp</a>
        </nav>
        {children}
      </body>
    </html>
  );
}
