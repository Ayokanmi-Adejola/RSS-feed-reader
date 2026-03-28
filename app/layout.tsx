import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Frontpage",
  description: "Your personalized front page for RSS and Atom reading"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip-link" href="#main-content">Skip to main content</a>
        {children}
      </body>
    </html>
  );
}
