import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";

/** Consistent JSON envelope: { ok: true, data } | { ok: false, error: { code, message, details } } */
export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ ok: true, data }, { status });
}

export function fail(status: number, code: string, message: string, details?: unknown) {
  return NextResponse.json({ ok: false, error: { code, message, details } }, { status });
}

export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown = {};
  const text = await req.text();
  if (text.trim().length) {
    try {
      raw = JSON.parse(text);
    } catch {
      throw new HttpError(400, "invalid_json", "Request body is not valid JSON");
    }
  }
  return schema.parse(raw);
}

export class HttpError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export async function handle(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ZodError) {
      return fail(422, "validation_error", "Request validation failed", e.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
    }
    if (e instanceof HttpError) return fail(e.status, e.code, e.message);
    console.error(e);
    return fail(500, "internal_error", "The server could not complete this request. Check the server terminal for details.");
  }
}
