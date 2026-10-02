import type { Metadata } from "next";
import "./globals.css";

// No Google Fonts: the app uses system fonts, so it also starts without internet access to fonts.googleapis.com

export const metadata: Metadata = {
  title: "Movie & Jokes Assistant",
  description: "AI SDK v5 chat with database, movie, joke and image tools",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
