import { z } from 'zod';

export const recordCreate = z.object({
  type: z.enum(['note', 'watchlist', 'memo']),
  companyId: z.string().max(100).nullable().optional(),
  title: z.string().trim().min(1).max(200),
  body: z.string().max(20000).default(''),
  status: z.enum(['open', 'reviewing', 'done']).default('open'),
}).strict();

export const recordUpdate = z.object({
  expectedVersion: z.number().int().positive(),
  changes: z.object({
    title: z.string().trim().min(1).max(200).optional(),
    body: z.string().max(20000).optional(),
    status: z.enum(['open', 'reviewing', 'done']).optional(),
    archived: z.boolean().optional(),
  }).strict().refine(value => Object.keys(value).length > 0, 'Supply at least one change'),
}).strict();

export class ApiError extends Error {
  constructor(status, message, details) { super(message); this.status = status; this.details = details; }
}

export async function parseBody(request, schema) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new ApiError(415, 'Use application/json');
  if (Number(request.headers.get('content-length') || 0) > 100000) throw new ApiError(413, 'Request is too large');
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'A JSON body is required');
  let size = 0;
  const chunks = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > 100000) { await reader.cancel(); throw new ApiError(413, 'Request is too large'); }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { all.set(chunk, offset); offset += chunk.length; }
  let body;
  try { body = JSON.parse(new TextDecoder().decode(all)); } catch { throw new ApiError(400, 'Invalid JSON'); }
  if (!schema) return body;
  const result = schema.safeParse(body);
  if (!result.success) throw new ApiError(400, 'Validation failed', result.error.issues.map(({ path, message }) => ({ path, message })));
  return result.data;
}
