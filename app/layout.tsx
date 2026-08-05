import type { Metadata, Viewport } from 'next';
import { Heebo } from 'next/font/google';
import './globals.css';
import { Providers } from '@/components/providers';
import { getSession } from '@/lib/auth/session';
import { APP_NAME, APP_TAGLINE } from '@/lib/constants';
import { ServiceWorkerRegistrar } from '@/components/layout/service-worker-registrar';

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  variable: '--font-heebo',
  display: 'swap',
  weight: ['300', '400', '500', '600', '700', '800'],
});

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} · ${APP_TAGLINE}`,
    template: `%s · ${APP_NAME}`,
  },
  description:
    'רשת חברתית לבעלי מקצוע בתחום היופי והטיפוח: גלו עבודות, עקבו, שוחחו, הזמינו טיפול עד הבית וקבעו מפגשים קבועים.',
  applicationName: APP_NAME,
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: APP_NAME,
    statusBarStyle: 'default',
  },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: '/icons/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/icons/apple-icon.png' }],
  },
  openGraph: {
    type: 'website',
    locale: 'he_IL',
    siteName: APP_NAME,
    title: `${APP_NAME} · ${APP_TAGLINE}`,
    description: 'גלו בעלי מקצוע בתחום היופי, עקבו אחרי העבודות שלהם והזמינו טיפול עד הבית.',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fdfbfb' },
    { media: '(prefers-color-scheme: dark)', color: '#131014' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();

  return (
    <html lang="he" dir="rtl" suppressHydrationWarning>
      <body className={`${heebo.variable} font-sans`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:start-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          דילוג לתוכן הראשי
        </a>
        <Providers user={session?.user ?? null} accessToken={session?.accessToken ?? null}>
          {children}
        </Providers>
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
