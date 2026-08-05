import 'server-only';
import { randomInt } from 'node:crypto';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { createAdminClient } from '@/lib/supabase/admin';

/** אלפבית ללא תווים דומים (0/O, 1/I) כדי שאפשר יהיה להעתיק את הקוד ידנית. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GROUPS = 4;
const GROUP_LENGTH = 4;

/** מייצר קוד שחזור אקראי בפורמט YOFI-XXXX-XXXX-XXXX-XXXX. */
export function generateRecoveryCode(): string {
  const groups: string[] = [];
  for (let g = 0; g < GROUPS; g += 1) {
    let group = '';
    for (let i = 0; i < GROUP_LENGTH; i += 1) {
      group += ALPHABET[randomInt(0, ALPHABET.length)];
    }
    groups.push(group);
  }
  return `YOFI-${groups.join('-')}`;
}

export function normalizeRecoveryCode(input: string): string {
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * יוצר קוד שחזור חדש למשתמש, מבטל קודם קודמים ושומר hash בלבד.
 * הקוד הגלוי מוחזר פעם אחת בלבד – ואינו נשמר בשום מקום.
 */
export async function issueRecoveryCode(profileId: string): Promise<string> {
  const admin = createAdminClient();
  const code = generateRecoveryCode();

  await admin
    .from('recovery_codes')
    .update({ revoked_at: new Date().toISOString() })
    .eq('profile_id', profileId)
    .is('used_at', null)
    .is('revoked_at', null);

  const { error } = await admin.from('recovery_codes').insert({
    profile_id: profileId,
    code_hash: await hashPassword(code),
    hint: code.slice(0, 9), // YOFI-XXXX – מספיק כדי לזהות, לא מספיק כדי לנחש
  });

  if (error) throw new Error(`יצירת קוד השחזור נכשלה: ${error.message}`);
  return code;
}

/** בודק קוד שחזור. מסמן אותו כמנוצל רק כאשר consume=true. */
export async function verifyRecoveryCode(
  profileId: string,
  code: string,
  consume = false,
): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('recovery_codes')
    .select('id, code_hash')
    .eq('profile_id', profileId)
    .is('used_at', null)
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!data) return false;

  const ok = await verifyPassword(normalizeRecoveryCode(code), data.code_hash);
  if (!ok) return false;

  if (consume) {
    await admin
      .from('recovery_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('id', data.id);
  }

  return true;
}
