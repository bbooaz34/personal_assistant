import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Boaz Ben Eli — AI Representative',
  description:
    'A conversational AI representative that explains and demonstrates the work of Boaz Ben Eli, grounded in verified professional knowledge.',
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
