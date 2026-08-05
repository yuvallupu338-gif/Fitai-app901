import { formatDate } from '@/lib/format';

/** גרף עמודות פשוט של הרשמות יומיות – ללא ספריות חיצוניות. */
export function SignupsChart({ data }: { data: Array<{ day: string; count: number }> }) {
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground">אין עדיין נתונים להצגה.</p>;
  }

  const max = Math.max(...data.map((item) => item.count), 1);

  return (
    <div className="space-y-2">
      <ul className="flex h-32 items-end gap-1" role="img" aria-label="גרף הרשמות יומיות">
        {data.map((item) => (
          <li key={item.day} className="group relative flex-1">
            <div
              className="rounded-t bg-primary/70 transition-colors group-hover:bg-primary"
              style={{ height: `${Math.max((item.count / max) * 100, 3)}%` }}
              title={`${formatDate(item.day)}: ${item.count} הרשמות`}
            />
          </li>
        ))}
      </ul>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>{formatDate(data[0].day)}</span>
        <span>{formatDate(data[data.length - 1].day)}</span>
      </div>
    </div>
  );
}
