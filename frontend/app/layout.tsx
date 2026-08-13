import type { Metadata } from "next";
import "./globals.css";
import NavAuth from "./nav-auth";

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
          <NavAuth />
        </nav>
        {children}
      </body>
    </html>
  );
}
