const STORAGE_KEY_PREFIX = 'arth_app_lock_v2:';
const LEGACY_STORAGE_KEY_PREFIX = 'arth_app_lock_v1:';

export type AutoLockTimeout = 'immediate' | '1m' | '5m' | '15m';

export interface AppLockPreferences {
  deviceId: string;
  enabled: boolean;
  configured: boolean;
  passcodeSalt?: string;
  passcodeHash?: string;
  autoLockTimeout?: AutoLockTimeout;
  lockOnBackground?: boolean;
  biometricsEnabled?: boolean;
}

export function newAppLockPreferences(): AppLockPreferences {
  return {
    deviceId: newDeviceId(),
    enabled: false,
    configured: false,
    autoLockTimeout: '5m',
    lockOnBackground: true,
    biometricsEnabled: false,
  };
}

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
}

function legacyStorageKey(userId: string): string {
  return `${LEGACY_STORAGE_KEY_PREFIX}${userId}`;
}

function newDeviceId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return `dev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

export function readAppLockPreferences(userId: string): AppLockPreferences {
  const fallback = newAppLockPreferences();
  if (typeof localStorage === 'undefined') return fallback;

  let raw = localStorage.getItem(storageKey(userId));
  // Fallback to legacy v1 preferences if v2 does not exist
  if (!raw) {
    raw = localStorage.getItem(legacyStorageKey(userId));
  }
  if (!raw) return fallback;

  try {
    const value = JSON.parse(raw) as Partial<AppLockPreferences>;
    const deviceId =
      typeof value.deviceId === 'string' && value.deviceId.length > 0
        ? value.deviceId
        : fallback.deviceId;

    const timeout: AutoLockTimeout =
      value.autoLockTimeout === 'immediate' ||
      value.autoLockTimeout === '1m' ||
      value.autoLockTimeout === '5m' ||
      value.autoLockTimeout === '15m'
        ? value.autoLockTimeout
        : '5m';

    return {
      deviceId,
      enabled: value.enabled === true,
      configured: value.configured === true || Boolean(value.passcodeHash),
      passcodeSalt: typeof value.passcodeSalt === 'string' ? value.passcodeSalt : undefined,
      passcodeHash: typeof value.passcodeHash === 'string' ? value.passcodeHash : undefined,
      autoLockTimeout: timeout,
      lockOnBackground: value.lockOnBackground !== false,
      biometricsEnabled: value.biometricsEnabled === true,
    };
  } catch {
    return fallback;
  }
}

export function writeAppLockPreferences(userId: string, preferences: AppLockPreferences): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(preferences));
  } catch {
    throw new Error('This browser could not save device lock settings. Check available storage.');
  }
}

export function appLockChannelName(userId: string): string {
  return `${STORAGE_KEY_PREFIX}tabs:${userId}`;
}
