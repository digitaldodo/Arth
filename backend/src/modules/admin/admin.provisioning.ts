import type { AdminRole } from '@arth/contracts';

export interface ProvisionedAdminDefinition {
  adminId: string;
  fullName: string;
  username: string;
  initialRole: AdminRole;
  isOwner: boolean;
  /** Salted scrypt hash of initial temporary credential; never stored in plaintext. */
  tempCredentialHash: string;
}

export const OWNER_ADMIN_ID = 'adm_ansh';

/**
 * Controlled five-administrator identity allowlist.
 * Initial temporary credentials are represented strictly as salted scrypt hashes.
 */
export const PRE_AUTHORIZED_ADMINS: readonly ProvisionedAdminDefinition[] = [
  {
    adminId: 'adm_ayush',
    fullName: 'Ayush Chaudhary',
    username: 'Ayush',
    initialRole: 'SUPPORT_ADMIN',
    isOwner: false,
    tempCredentialHash:
      'scrypt:83faa282b028fc90b0ee8309554f7f75:49a7f778f9186496bcf6b1041536367f37208adf7fab525cdf75f3324ce3b7449ca77c1410db7b33a5cb231e8d200deb9646dd510cbd0727dc8234c01a71f1af',
  },
  {
    adminId: 'adm_arun',
    fullName: 'Arun Kushwah',
    username: 'Arun',
    initialRole: 'SUPPORT_ADMIN',
    isOwner: false,
    tempCredentialHash:
      'scrypt:1f395fb117d820ffa286de37a1d1a74e:47a253338794d3a6484ef2007aec904d988ada5e7f3a279e12a972e1978fe10766713011161274ae311e1f060605061c44885c1f03ff120ddc2e81d372b5fddc',
  },
  {
    adminId: 'adm_ansh',
    fullName: 'Ansh Gupta',
    username: 'Ansh',
    initialRole: 'OWNER_ADMIN',
    isOwner: true,
    tempCredentialHash:
      'scrypt:c5b4da0a007b8b93a1f0ea1187713eb0:69969ec6e1d6407aeb105d0da79fc7c1ca7e45040c1c483389592432b06c9718ae8fa6258505498050d193c152b6a6d69199f22d1e60f1733b9bdc2c7af44b93',
  },
  {
    adminId: 'adm_akshat',
    fullName: 'Akshat Kumar',
    username: 'Akshat',
    initialRole: 'SUPPORT_ADMIN',
    isOwner: false,
    tempCredentialHash:
      'scrypt:cfc37a7e6bdd7fb7fb912204690720e9:006d7399056dc9617a5d6519a26149cbf03d12ea3b5648d1affe62f023e9e3931850cbb297f598d8585c19e2408cba9199572dc291878b7744fc1694a3d3e6a2',
  },
  {
    adminId: 'adm_dev',
    fullName: 'Dev Chaudhary',
    username: 'Dev',
    initialRole: 'SUPPORT_ADMIN',
    isOwner: false,
    tempCredentialHash:
      'scrypt:ce99abcf8e51cb092c4ed9e007d79592:7d143947acbc54a5528a559c018fdf4426938056d3ec130a42de93cacd5244d20e45ca8c6984b4da8fa0c6032fc65b28818d9e1c40403f2082fd488058c85ecf',
  },
] as const;
