import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Belief Debate Engine',
  description:
    'Autonomous dual-agent epistemic debate powered by thinkn.ai · Exa · GPT-4o',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang='en' className='dark'>
      <body className='bg-zinc-950 text-zinc-100 antialiased font-mono min-h-screen'>
        {children}
      </body>
    </html>
  );
}
