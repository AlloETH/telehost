/**
 * API base URL for all backend calls.
 * Points to the NestJS API service.
 */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

/**
 * Build a full API URL from a path like "/agents" or "/auth/session".
 */
export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

/**
 * Default fetch options for cross-origin API calls (sends cookies).
 */
export const apiFetchOpts: RequestInit = {
  credentials: "include",
};

/**
 * Convenience: fetch with credentials included.
 */
export function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  return fetch(apiUrl(path), {
    ...apiFetchOpts,
    ...init,
    headers: {
      ...init?.headers,
    },
  });
}
