'use client';

import * as React from 'react';
import { ThemeProvider } from 'next-themes';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Toaster } from '@/components/ui/toaster';
import { getBrowserClient, fetchFreshToken } from '@/lib/supabase/client';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';
import type { SessionUser } from '@/lib/auth/session';

type SessionContextValue = {
  user: SessionUser | null;
  supabase: SupabaseClient<Database>;
  /** מצב תצוגה נוכחי: משתמש רגיל או בעל מקצוע. */
  isProMode: boolean;
};

const SessionContext = React.createContext<SessionContextValue | null>(null);

/** גישה למשתמש המחובר ולקוח Supabase מכל קומפוננטת לקוח. */
export function useSession() {
  const context = React.useContext(SessionContext);
  if (!context) {
    throw new Error('useSession חייב להיות בתוך Providers');
  }
  return context;
}

/** נוח כאשר צריך רק את המשתמש (עשוי להיות null לגולש אנונימי). */
export function useCurrentUser() {
  return useSession().user;
}

const TOKEN_REFRESH_MS = 45 * 60 * 1000;

export function Providers({
  children,
  user,
  accessToken,
}: {
  children: React.ReactNode;
  user: SessionUser | null;
  accessToken: string | null;
}) {
  const [token, setToken] = React.useState(accessToken);

  React.useEffect(() => {
    setToken(accessToken);
  }, [accessToken]);

  // רענון תקופתי של אסימון הגישה כדי שחיבורי Realtime לא יינתקו.
  React.useEffect(() => {
    if (!user) return undefined;

    const interval = setInterval(async () => {
      const fresh = await fetchFreshToken();
      if (fresh) setToken(fresh);
    }, TOKEN_REFRESH_MS);

    return () => clearInterval(interval);
  }, [user]);

  const supabase = React.useMemo(() => getBrowserClient(token), [token]);

  const value = React.useMemo<SessionContextValue>(
    () => ({
      user,
      supabase,
      isProMode: Boolean(user?.isProfessional && user.activeMode === 'professional'),
    }),
    [user, supabase],
  );

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <SessionContext.Provider value={value}>
        <TooltipProvider delayDuration={200}>
          {children}
          <Toaster />
        </TooltipProvider>
      </SessionContext.Provider>
    </ThemeProvider>
  );
}
