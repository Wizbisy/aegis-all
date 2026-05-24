import type { Metadata } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const plusJakarta = Plus_Jakarta_Sans({ 
  subsets: ['latin'], 
  variable: '--font-plus-jakarta' 
});

const jetbrainsMono = JetBrains_Mono({ 
  subsets: ['latin'], 
  variable: '--font-mono' 
});

export const metadata: Metadata = {
  title: {
    default: 'Aegis Wealth Control',
    template: '%s | Aegis',
  },
  description: 'Aegis is the control plane for autonomous Arc native agents, policies, and financial execution.',
  applicationName: 'Aegis',
  keywords: ['Aegis', 'Arc', 'Circle', 'agent wallet', 'autonomous finance', 'USDC'],
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || 'https://aegisintent.xyz'),
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/apple-touch-icon.png',
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var saved = localStorage.getItem('aegis-theme');
                  if (saved === 'light') {
                    document.documentElement.classList.add('light');
                    document.documentElement.classList.remove('dark');
                  } else {
                    document.documentElement.classList.add('dark');
                    document.documentElement.classList.remove('light');
                  }
                } catch (e) {}
              })()
            `,
          }}
        />
      </head>
      <body className={`${plusJakarta.variable} ${jetbrainsMono.variable} min-h-screen bg-(--background) font-sans text-(--foreground) antialiased`}>
        {children}
      </body>
    </html>
  );
}
