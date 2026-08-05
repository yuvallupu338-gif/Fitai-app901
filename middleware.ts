import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth/constants';

/**
 * שכבת הגנה ראשונה בלבד: בודקת קיום עוגיית התחברות ומפנה למסך ההתחברות.
 * האימות האמיתי (בדיקת הטוקן מול המסד) מתבצע בשרת בכל דף ופעולה,
 * וההרשאות נאכפות גם ברמת Row Level Security.
 */
const PROTECTED_PREFIXES = ['/dashboard', '/settings', '/admin', '/messages', '/create', '/pro', '/book'];
const AUTH_ROUTES = ['/login', '/register', '/recover'];

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(SESSION_COOKIE)?.value);

  if (!hasSession && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return NextResponse.redirect(url);
  }

  if (hasSession && AUTH_ROUTES.includes(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * כל הנתיבים למעט קבצים סטטיים, תמונות ונתיבי מערכת.
     */
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.webmanifest|sw.js|robots.txt|api/).*)',
  ],
};
