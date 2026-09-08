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
        {/* Without scripting nothing will ever remove `pre-reveal`, and the
            interface would stay hidden for good. */}
        <noscript>
          <style>{`.pre-reveal #wordmark, .pre-reveal #contact, .pre-reveal #chat {
            opacity: 1; transform: none; pointer-events: auto;
          }`}</style>
        </noscript>
      </head>
      {/* `pre-reveal` is set here, in the server-rendered markup, rather than
          by the orb on mount: an effect only runs after the first paint, so
          the wordmark, contact methods and conversation pill were painted at
          full opacity for a frame and then hidden. The orb removes the class
          when its entry flight reaches the reveal; nothing ever adds it. */}
      <body className="antialiased pre-reveal">{children}</body>
    </html>
  );
}
