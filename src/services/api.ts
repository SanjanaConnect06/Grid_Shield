import type { ApiErr, ApiOk } from "@/types/api";

export class ApiError extends Error {
  constructor(message: string, public status: number, public code: string, public details?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) }, cache: "no-store" });
  } catch {
    throw new ApiError("Cannot reach the GRID SHIELD backend", 0, "network_error");
  }
  let body: ApiOk<T> | ApiErr | null = null;
  try {
    body = (await res.json()) as ApiOk<T> | ApiErr;
  } catch {
    /* non-JSON */
  }
  if (!res.ok || !body || body.ok === false) {
    const err = body && body.ok === false ? body.error : null;
    const detail = Array.isArray(err?.details) ? ` (${(err!.details as { path: string; message: string }[]).map((d) => `${d.path}: ${d.message}`).join("; ")})` : "";
    throw new ApiError((err?.message ?? `Request failed (${res.status})`) + detail, res.status, err?.code ?? "http_error", err?.details);
  }
  return body.data;
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: "PATCH", body: JSON.stringify(body ?? {}) }),
};
