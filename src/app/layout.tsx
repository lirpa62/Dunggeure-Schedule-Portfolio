import type { Metadata, Viewport } from "next";
import { Noto_Sans_KR } from "next/font/google";
import localFont from "next/font/local";
import "@/styles/globals.css";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { ThemeProvider } from "@/components/layout/ThemeProvider";
import { AuthProvider } from "@/components/layout/AuthProvider";

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  variable: "--font-body",
  weight: ["300", "400", "500", "700"],
});

const hakgyoansimNadeuri = localFont({
  src: [
    {
      path: "./fonts/HakgyoansimNadeuriTTF-L.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/HakgyoansimNadeuriTTF-B.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  variable: "--font-hakgyoansimnadeuri",
  display: "swap",
  adjustFontFallback: false,
  declarations: [
    {
      prop: "unicode-range",
      // 일부 이중모음+받침 글리프가 빈칸으로 표시되어 해당 계열은 fallback 폰트로 렌더링한다.
      value:
        "U+0-ACFC, U+AD18, U+AD34, U+AD50-AD88, U+ADA4, U+ADC0, U+ADDC-AE13, U+AE30-AF48, U+AF64, U+AF80, U+AF9C-AFD4, U+AFF0, U+B00C, U+B028-B05F, U+B07C-B194, U+B1B0, U+B1CC, U+B1E8-B220, U+B23C, U+B258, U+B274-B2AB, U+B2C8-B3E0, U+B3FC, U+B418, U+B434-B46C, U+B488, U+B4A4, U+B4C0-B4F7, U+B514-B62C, U+B648, U+B664, U+B680-B6B8, U+B6D4, U+B6F0, U+B70C-B743, U+B760-B878, U+B894, U+B8B0, U+B8CC-B904, U+B920, U+B93C, U+B958-B98F, U+B9AC-BAC4, U+BAE0, U+BAFC, U+BB18-BB2C, U+BB2E-BB50, U+BB6C, U+BB88, U+BBA4-BBDB, U+BBF8-BD10, U+BD2C, U+BD48, U+BD64-BD9C, U+BDB8, U+BDD4, U+BDF0-BE27, U+BE44-BF5C, U+BF78, U+BF94, U+BFB0-BFE8, U+C004, U+C020, U+C03C-C073, U+C090-C1A8, U+C1C4, U+C1E0, U+C1FC-C234, U+C250, U+C26C, U+C288-C2BF, U+C2DC-C3F4, U+C410, U+C42C, U+C448-C480, U+C49C, U+C4B8, U+C4D4-C50B, U+C528-C640, U+C65C, U+C678, U+C694-C6CC, U+C6E8, U+C704, U+C720-C757, U+C774-C88C, U+C8A8, U+C8C4, U+C8E0-C918, U+C934, U+C950, U+C96C-C9A3, U+C9C0-CAD8, U+CAF4, U+CB10, U+CB2C-CB64, U+CB80, U+CB9C, U+CBB8-CBEF, U+CC0C-CD24, U+CD40, U+CD5C, U+CD78-CDB0, U+CDCC, U+CDE8, U+CE04-CE3B, U+CE58-CF70, U+CF8C, U+CFA8, U+CFC4-CFFC, U+D018, U+D034, U+D050-D087, U+D0A4-D1BC, U+D1D8, U+D1F4, U+D210-D248, U+D264, U+D280, U+D29C-D2D3, U+D2F0-D408, U+D424, U+D440, U+D45C-D494, U+D4B0, U+D4CC, U+D4E8-D51F, U+D53C-D654, U+D670, U+D68C, U+D6A8-D6E0, U+D6FC, U+D718, U+D734-D76B, U+D788-10FFFF",
    },
  ],
});

const gamjaFlower = localFont({
  src: [
    {
      path: "./fonts/GamjaFlower-Regular.ttf",
      weight: "400",
      style: "normal",
    },
  ],
  variable: "--font-gamjaflower",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_BASE_URL
  ? process.env.NEXT_PUBLIC_BASE_URL
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";
const ogImageUrl = "/og_image.png?v=20260508-2";
const faviconUrl = "/favicon-20260510.png";
const appleTouchIconUrl = "/apple-touch-icon-20260510.png";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "둥그레 일정표",
  description: "치지직 스트리머 둥그레의 일정표",
  applicationName: "둥그레 일정표",
  alternates: {
    canonical: "/schedule",
  },
  openGraph: {
    title: "둥그레 일정표",
    description: "치지직 스트리머 둥그레의 일정표",
    url: "/schedule",
    siteName: "둥그레 일정표",
    locale: "ko_KR",
    type: "website",
    images: [
      {
        url: ogImageUrl,
        width: 1200,
        height: 630,
        alt: "둥그레 일정표",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "둥그레 일정표",
    description: "치지직 스트리머 둥그레의 일정표",
    images: [ogImageUrl],
  },
  icons: {
    icon: [
      {
        url: faviconUrl,
        type: "image/png",
        sizes: "512x512",
      },
    ],
    shortcut: [
      {
        url: faviconUrl,
        type: "image/png",
      },
    ],
    apple: [
      {
        url: appleTouchIconUrl,
        type: "image/png",
        sizes: "180x180",
      },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body
        className={`${notoSansKR.variable} ${hakgyoansimNadeuri.variable} ${gamjaFlower.variable} font-body`}
      >
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
