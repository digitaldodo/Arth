import type { HealthCheckResponse } from "@arth/contracts";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

/**
 * Checks the operational status of the Arth backend service.
 */
export async function fetchHealthStatus(): Promise<HealthCheckResponse> {
  const response = await fetch(`${API_BASE_URL}/health`, {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Health check failed with HTTP status ${response.status}`);
  }

  return response.json();
}
