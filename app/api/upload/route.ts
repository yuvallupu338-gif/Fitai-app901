import { NextResponse } from 'next/server';
import { randomBytes } from 'node:crypto';
import { getSession } from '@/lib/auth/session';
import { createAdminClient } from '@/lib/supabase/admin';
import { consumeRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';
import { STORAGE_BUCKETS, UPLOAD_LIMITS, type StorageBucket } from '@/lib/constants';

export const runtime = 'nodejs';

/**
 * העלאת קבצים.
 *
 * ההעלאה עוברת דרך השרת ולא ישירות מהדפדפן כדי שנוכל:
 *  – לאמת את המשתמש ואת מכסת ההעלאות שלו,
 *  – לבדוק סוג וגודל קובץ, כולל "חתימת" הקובץ עצמו ולא רק את שם הסיומת,
 *  – לייצר שם קובץ אקראי שאינו חושף מידע על המשתמש או על התוכן.
 */

const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
  'application/pdf': 'pdf',
};

/** בדיקת חתימת קובץ בסיסית – מונעת העלאת קובץ מסוכן עם סיומת תמימה. */
function detectSignature(bytes: Uint8Array): string | null {
  const startsWith = (...signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  const ascii = (offset: number, text: string) =>
    [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0));

  if (startsWith(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return 'image/png';
  if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'image/webp';
  if (ascii(4, 'ftypavif') || ascii(4, 'ftypavis')) return 'image/avif';
  if (ascii(4, 'ftyp')) return 'video/mp4';
  if (startsWith(0x1a, 0x45, 0xdf, 0xa3)) return 'video/webm';
  if (ascii(0, '%PDF')) return 'application/pdf';

  return null;
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'צריך להתחבר כדי להעלות קבצים' }, { status: 401 });
  }

  if (!(await consumeRateLimit(RATE_LIMITS.upload, session.user.id))) {
    return NextResponse.json({ error: 'העלית הרבה קבצים בזמן קצר. אפשר לנסות שוב מאוחר יותר.' }, { status: 429 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'הבקשה אינה תקינה' }, { status: 400 });
  }

  const file = formData.get('file');
  const bucketInput = String(formData.get('bucket') ?? 'posts');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'לא נבחר קובץ' }, { status: 400 });
  }

  if (!STORAGE_BUCKETS.includes(bucketInput as StorageBucket)) {
    return NextResponse.json({ error: 'יעד העלאה לא מוכר' }, { status: 400 });
  }
  const bucket = bucketInput as StorageBucket;

  const isVideo = file.type.startsWith('video/');
  const isDocument = file.type === 'application/pdf';
  const limits = isVideo ? UPLOAD_LIMITS.video : isDocument ? UPLOAD_LIMITS.document : UPLOAD_LIMITS.image;

  if (!(limits.mimeTypes as readonly string[]).includes(file.type)) {
    return NextResponse.json({ error: 'סוג הקובץ אינו נתמך' }, { status: 415 });
  }

  if (file.size > limits.maxBytes) {
    const mb = Math.round(limits.maxBytes / (1024 * 1024));
    return NextResponse.json({ error: `הקובץ גדול מדי. הגודל המרבי הוא ${mb} מגה־בייט.` }, { status: 413 });
  }

  if (file.size === 0) {
    return NextResponse.json({ error: 'הקובץ ריק' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const signature = detectSignature(new Uint8Array(buffer.subarray(0, 32)));

  if (!signature) {
    return NextResponse.json({ error: 'לא ניתן לזהות את סוג הקובץ. יש להעלות תמונה או סרטון תקינים.' }, { status: 415 });
  }

  // התאמה בין הסוג המוצהר לחתימה בפועל (mp4/mov חולקים חתימה זהה).
  const signatureFamily = signature.split('/')[0];
  const declaredFamily = file.type.split('/')[0];
  if (signatureFamily !== declaredFamily) {
    return NextResponse.json({ error: 'תוכן הקובץ אינו תואם לסוג שהוצהר' }, { status: 415 });
  }

  // תעודות מקצועיות מותרות רק בדלי הפרטי.
  if (isDocument && bucket !== 'certificates') {
    return NextResponse.json({ error: 'מסמכים ניתן להעלות רק כתעודה מקצועית' }, { status: 400 });
  }

  const extension = MIME_EXTENSIONS[file.type] ?? 'bin';
  const path = `${session.user.id}/${Date.now().toString(36)}-${randomBytes(8).toString('hex')}.${extension}`;

  const admin = createAdminClient();
  const { error } = await admin.storage.from(bucket).upload(path, buffer, {
    contentType: file.type,
    cacheControl: '31536000',
    upsert: false,
  });

  if (error) {
    console.error('[upload]', error.message);
    return NextResponse.json({ error: 'העלאת הקובץ נכשלה' }, { status: 500 });
  }

  // דלי התעודות פרטי – מחזירים נתיב ולא כתובת ציבורית.
  if (bucket === 'certificates') {
    const { data: signed } = await admin.storage.from(bucket).createSignedUrl(path, 60 * 60);
    return NextResponse.json({ path, url: signed?.signedUrl ?? null, bucket });
  }

  const { data } = admin.storage.from(bucket).getPublicUrl(path);

  return NextResponse.json({
    path,
    url: data.publicUrl,
    bucket,
    mediaType: isVideo ? 'video' : 'image',
  });
}
