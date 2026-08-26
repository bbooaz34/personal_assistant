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
      <body className="antialiased">{children}</body>
    </html>
  );
}
