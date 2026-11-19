/**
 * SpendSense Username System Utilities & Validation
 * Centralized pure utilities, validation rules, collision-safe generation,
 * and suggestion algorithms for user handles.
 */

/**
 * Reserved system usernames that cannot be registered or claimed.
 */
export const RESERVED_USERNAMES = new Set([
  'admin',
  'administrator',
  'support',
  'system',
  'arth',
  'root',
  'superuser',
  'help',
  'api',
  'auth',
  'null',
  'undefined',
  'moderator',
  'staff',
]);

/**
 * Validates username format:
 * - Length between 3 and 20 characters
 * - Only lowercase English letters, numbers, and underscores (^[a-z0-9_]{3,20}$)
 */
export function isValidUsername(username: string): boolean {
  if (typeof username !== 'string') return false;
  const clean = username.trim().toLowerCase();
  return /^[a-z0-9_]{3,20}$/.test(clean);
}

/**
 * Checks whether a candidate username is in the reserved system list.
 */
export function isReservedUsername(username: string): boolean {
  if (typeof username !== 'string') return false;
  return RESERVED_USERNAMES.has(username.trim().toLowerCase());
}

/**
 * Generates a random, unique, human-readable username (e.g. arth_user_58321).
 * Completely decoupled from user private info (email, phone, name).
 */
export function generateRandomCandidateUsername(): string {
  const num = Math.floor(10000 + Math.random() * 90000);
  return `arth_user_${num}`;
}

/**
 * Generates 2-3 available alternative username suggestions when a candidate is taken.
 */
export async function generateUsernameSuggestions(
  base: string,
  checkAvailableFn?: (candidate: string) => Promise<boolean>
): Promise<string[]> {
  const clean = (base || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
  const prefix = (clean.length > 0 ? clean : 'user').slice(0, 14);
  const currentYear = new Date().getFullYear().toString();

  const candidatePool = [
    `${prefix}_${Math.floor(10 + Math.random() * 89)}`,
    `${prefix}_${currentYear}`,
    `the_${prefix}`.slice(0, 20),
    `${prefix}_arth`.slice(0, 20),
    `my_${prefix}`.slice(0, 20),
    `${prefix}_${Math.floor(100 + Math.random() * 899)}`.slice(0, 20),
  ];

  const uniqueCandidates = Array.from(new Set(candidatePool)).filter(
    (c) => isValidUsername(c) && !isReservedUsername(c) && c !== clean
  );

  const suggestions: string[] = [];
  for (const candidate of uniqueCandidates) {
    if (suggestions.length >= 3) break;
    if (checkAvailableFn) {
      try {
        const ok = await checkAvailableFn(candidate);
        if (ok) {
          suggestions.push(candidate);
        }
      } catch {
        suggestions.push(candidate);
      }
    } else {
      suggestions.push(candidate);
    }
  }

  while (suggestions.length < 2) {
    const fallback = generateRandomCandidateUsername();
    if (!suggestions.includes(fallback)) {
      suggestions.push(fallback);
    }
  }

  return suggestions.slice(0, 3);
}
