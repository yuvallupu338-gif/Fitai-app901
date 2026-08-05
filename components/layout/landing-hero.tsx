import Link from 'next/link';
import { CalendarHeart, Home, MessagesSquare, Repeat, Search, Sparkles, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProfessionalRail } from '@/components/professional/professional-card';
import { ProfessionChips } from '@/components/search/profession-chips';
import { getDiscoverySections } from '@/lib/data/discovery';
import { getPopularProfessions } from '@/lib/data/reference';
import { APP_NAME } from '@/lib/constants';

const FEATURES = [
  {
    icon: Search,
    title: 'מוצאים בדיוק את מי שצריך',
    description: 'חיפוש לפי מקצוע, עיר, מרחק, מחיר, דירוג וזמינות – כולל "ספר שמגיע הביתה בחדרה".',
  },
  {
    icon: Home,
    title: 'מזמינים עד הבית',
    description: 'בוחרים שירות, תאריך ושעה. הכתובת המלאה נחשפת לבעל המקצוע רק לאחר אישור ההזמנה.',
  },
  {
    icon: Repeat,
    title: 'קובעים מפגש קבוע',
    description: '"כל שבועיים ביום חמישי ב־17:00" – הסדרה נוצרת ביומן אחרי אישור שני הצדדים.',
  },
  {
    icon: MessagesSquare,
    title: 'מדברים בצ׳אט',
    description: 'שיחה פרטית בזמן אמת, שליחת תמונת השראה ועדכוני מערכת על כל שינוי בהזמנה.',
  },
];

/** עמוד הנחיתה לגולשים שאינם מחוברים – מציג תוכן אמיתי מהמסד. */
export async function LandingHero() {
  const [sections, professions] = await Promise.all([getDiscoverySections(null), getPopularProfessions(12)]);

  return (
    <div className="space-y-12 pb-12">
      <section className="relative overflow-hidden px-5 py-12 text-center sm:py-16">
        <div
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_50%_0%,hsl(var(--primary)/0.16),transparent_70%)]"
          aria-hidden
        />

        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/25 bg-primary/8 px-3 py-1 text-xs font-medium text-primary">
          <Sparkles className="size-3.5" aria-hidden />
          הרשת החברתית של עולם היופי והטיפוח
        </span>

        <h1 className="mx-auto mt-5 max-w-2xl text-3xl font-bold leading-tight sm:text-5xl">
          העבודות הכי יפות, בעלי המקצוע הכי טובים —{' '}
          <span className="text-primary">עד אליכם הביתה</span>
        </h1>

        <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground sm:text-lg">
          {APP_NAME} מחברת בין אנשים לבעלי מקצוע בתחום היופי: תספורות, איפור, מניקור, גבות, ריסים
          וטיפולי פנים. עוקבים אחרי עבודות אמיתיות, שולחים הודעה ומזמינים – חד־פעמי או קבוע.
        </p>

        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Button size="lg" asChild>
            <Link href="/register">הרשמה חינם</Link>
          </Button>
          <Button size="lg" variant="outline" asChild>
            <Link href="/search">גילוי בעלי מקצוע</Link>
          </Button>
        </div>

        <p className="mt-4 text-xs text-muted-foreground">
          בלי אימייל · שם משתמש וסיסמה בלבד · אפשר להתקין כאפליקציה בטלפון
        </p>
      </section>

      <section className="px-4 lg:px-0">
        <h2 className="mb-3 text-center font-semibold">מה מחפשים היום?</h2>
        <div className="mx-auto max-w-3xl">
          <ProfessionChips professions={professions} />
        </div>
      </section>

      <ProfessionalRail
        title="בעלי מקצוע מומלצים"
        description="הדירוגים הגבוהים באפליקציה"
        professionals={sections.recommended}
        href="/search?sort=rating"
      />

      <ProfessionalRail
        title="חדשים באפליקציה"
        description="הצטרפו לאחרונה"
        professionals={sections.newest}
        href="/search?sort=newest"
      />

      <ProfessionalRail
        title="מגיעים עד הבית"
        professionals={sections.homeVisits}
        href="/search?homeVisit=true"
      />

      <section className="px-4 lg:px-0">
        <div className="mx-auto grid max-w-4xl gap-4 sm:grid-cols-2">
          {FEATURES.map((feature) => (
            <div key={feature.title} className="surface p-5">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <feature.icon className="size-5" aria-hidden />
              </span>
              <h3 className="mt-3 font-semibold">{feature.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-4 rounded-3xl bg-primary/8 p-8 text-center lg:mx-0">
        <CalendarHeart className="mx-auto size-10 text-primary" aria-hidden />
        <h2 className="mt-3 text-xl font-bold">גם אתם בעלי מקצוע?</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          פתחו פרופיל מקצועי באותו חשבון, העלו את תיק העבודות שלכם, קבעו שירותים ומחירים
          וקבלו הזמנות ולקוחות קבועים. ההרשמה חינם.
        </p>
        <Button className="mt-5" asChild>
          <Link href="/register">
            <Star className="size-4" aria-hidden />
            יצירת פרופיל מקצועי
          </Link>
        </Button>
      </section>
    </div>
  );
}
