import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Boaz Ben Eli — EBOS',
  description:
    "EBOS is Boaz Ben Eli's AI agent: it explains and demonstrates his work in conversation, " +
    'grounded in verified professional knowledge.',
};

// Tints the browser chrome on mobile to the page's own ground colour
// (--color-ground in globals.css), so the address bar blends into the page
// instead of banding above it. The icon is dark; the app is not.
export const viewport: Viewport = {
  themeColor: '#eef0f7',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Sora:wght@300;400;600&family=IBM+Plex+Mono:wght@400&family=Noto+Sans+Hebrew:wght@400;500&display=swap"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
