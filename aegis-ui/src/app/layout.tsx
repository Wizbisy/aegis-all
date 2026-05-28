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
    default: 'Aegis | Autonomous Wealth Engine',
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
        <meta
          name="talentapp:project_verification"
          content="5e4e5ed62cc921f0b6d78da7c6dfa726eed3ed9cf64b33a2afee285059382b9e21296fb5e90d39f85e66c6080cf0ed81cd632b15f2b1a15eff116ab0ad4553cd"
        />
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
