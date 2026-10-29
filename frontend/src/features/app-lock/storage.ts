const STORAGE_KEY_PREFIX = 'arth_app_lock_v1:';

export interface AppLockPreferences {
  deviceId: string;
  enabled: boolean;
  configured: boolean;
}

export function newAppLockPreferences(): AppLockPreferences {
  return { deviceId: newDeviceId(), enabled: false, configured: false };
}

function storageKey(userId: string): string {
  return `${STORAGE_KEY_PREFIX}${userId}`;
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
  throw new Error('This browser cannot create a secure device identifier.');
}

export function readAppLockPreferences(userId: string): AppLockPreferences {
  const fallback = newAppLockPreferences();
  const raw = localStorage.getItem(storageKey(userId));
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw) as Partial<AppLockPreferences>;
    if (typeof value.deviceId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.deviceId)) {
      throw new Error('Invalid device lock preferences.');
    }
    return {
      deviceId: value.deviceId,
      enabled: value.enabled === true,
      configured: value.configured === true,
    };
  } catch {
    throw new Error('Device lock settings could not be read safely.');
  }
}

export function writeAppLockPreferences(userId: string, preferences: AppLockPreferences): void {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(preferences));
  } catch {
    throw new Error('This browser could not save the device lock setting. Check available storage and try again.');
  }
}

export function appLockChannelName(userId: string): string {
  return `${STORAGE_KEY_PREFIX}tabs:${userId}`;
}
