export type PasswordStatus = 'configured' | 'not_configured' | 'unknown';

/** Read only the explicit Auth metadata marker; identities and email presence are not proof. */
export function getPasswordStatus(userMetadata: unknown): PasswordStatus {
  if (!userMetadata || typeof userMetadata !== 'object') return 'unknown';
  const marker = (userMetadata as Record<string, unknown>).has_password;
  if (marker === true) return 'configured';
  if (marker === false) return 'not_configured';
  return 'unknown';
}

export function isPasswordConfigured(status: PasswordStatus): boolean {
  return status === 'configured';
}
