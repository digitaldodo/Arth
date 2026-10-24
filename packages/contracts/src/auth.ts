/**
 * Shared API contract for authenticated user identity (GET /api/v1/auth/me).
 */
export interface AuthIdentityResponse {
  userId: string;
  email: string | null;
  role: string;
  exp: number;
}
