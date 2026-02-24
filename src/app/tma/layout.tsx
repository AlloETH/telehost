import Script from "next/script";
import { TMAProvider } from "./tma-provider";

export const metadata = {
  title: "Telehost",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
    userScalable: false,
  },
};

export default function TMALayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Script
        src="https://telegram.org/js/telegram-web-app.js"
        strategy="beforeInteractive"
      />
      <TMAProvider>{children}</TMAProvider>
    </>
  );
}
