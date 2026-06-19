import "./styles.css";
import type { ReactNode } from "react";

export const metadata = {
  title: "WeBirr Checkout Kit Example",
  description: "Mocked Next.js WeBirr checkout kit example."
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

