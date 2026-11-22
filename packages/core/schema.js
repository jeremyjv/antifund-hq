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

const TEAM_MEMBERS = ['geoff', 'jake', 'logan', 'steve', 'laura', 'jeremy'];
export const weekId = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).getUTCDay() === 1, 'Week must start on a Monday');
export const focusCreate = z.object({
  week: weekId,
  member: z.enum(TEAM_MEMBERS),
  title: z.string().trim().min(1).max(200),
}).strict();

export const focusUpdate = z.object({
  expectedVersion: z.number().int().positive(),
  changes: z.object({
    title: z.string().trim().min(1).max(200).optional(),
    done: z.boolean().optional(),
    archived: z.boolean().optional(),
  }).strict().refine(value => Object.keys(value).length > 0, 'Supply at least one change'),
}).strict();

const MEMBERS = ['geoff', 'jake', 'logan', 'steve', 'laura', 'jeremy'];
export const member = z.enum(MEMBERS);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Invalid date');
const title = z.string().trim().min(1).max(200);
export const goalCreate = z.object({ title, member, targetDate: isoDate, actor: member }).strict();
export const goalUpdate = z.object({
  changes: z.object({ title: title.optional(), member: member.optional(), targetDate: isoDate.optional(), archived: z.boolean().optional() })
    .strict().refine((v) => Object.keys(v).length > 0, 'Supply at least one change'),
}).strict();
export const taskCreate = z.object({ title, assignee: member.nullable().optional(), actor: member }).strict();
export const taskAction = z.object({
  action: z.enum(['claim', 'unclaim', 'complete', 'reopen', 'remove']),
  actor: member,
  note: z.string().max(500).optional(),
}).strict();
export const goalNote = z.object({ note: z.string().trim().min(1).max(500), actor: member }).strict();
export const agentKeyCreate = z.object({ member }).strict();

// In-house CRM
const optText = (max) => z.string().trim().max(max).nullable().optional();
const stage = z.enum(['sourced', 'first_call', 'diligence', 'partner_review', 'invested', 'passed']).nullable();
const orgFields = {
  name: title, kind: z.enum(['company', 'fund', 'lp', 'lab']), sector: optText(120), domain: optText(200),
  stage: stage.optional(), dealOwner: member.nullable().optional(), nextStep: optText(300), nextStepDue: isoDate.nullable().optional(),
  passReason: optText(300), notes: z.string().max(5000).optional(),
};
const personFields = {
  name: title, kind: z.enum(['founder', 'investor', 'lp', 'expert', 'operator']), title: optText(120), orgId: z.string().uuid().nullable().optional(),
  email: z.string().trim().email().max(200).nullable().optional().or(z.literal('').transform(() => null)), location: optText(120),
  relOwner: member.nullable().optional(), strength: z.enum(['cold', 'warm', 'strong']).optional(), notes: z.string().max(5000).optional(),
};
const partial = (fields) => z.object({ ...Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v.optional()])), archived: z.boolean().optional() })
  .strict().refine((v) => Object.keys(v).length > 0, 'Supply at least one change');
export const crmOrgCreate = z.object({ ...orgFields, actor: member }).strict();
export const crmPersonCreate = z.object({ ...personFields, actor: member }).strict();
export const crmOrgUpdate = z.object({ expectedVersion: z.number().int().positive(), changes: partial(orgFields), actor: member }).strict();
export const crmPersonUpdate = z.object({ expectedVersion: z.number().int().positive(), changes: partial(personFields), actor: member }).strict();
export const crmInteractionCreate = z.object({
  personId: z.string().uuid().nullable().optional(), orgId: z.string().uuid().nullable().optional(),
  kind: z.enum(['meeting', 'call', 'email', 'intro', 'note']), summary: z.string().trim().min(1).max(1000),
  occurredAt: isoDate.optional(), actor: member,
}).strict();

// Signal Watch
export const SIGNAL_SOURCES = ['hn', 'github', 'huggingface', 'arxiv', 'sec_form_d', 'usaspending', 'bluesky'];
export const SIGNAL_KINDS = ['launch', 'repo', 'model', 'paper', 'raise', 'contract', 'post'];
const terms = z.array(z.string().trim().toLowerCase().min(1).max(60)).max(40).transform((a) => [...new Set(a)]);
const watchFields = {
  name: z.string().trim().min(1).max(80), description: z.string().trim().max(600),
  sources: z.array(z.enum(SIGNAL_SOURCES)).max(SIGNAL_SOURCES.length).transform((a) => [...new Set(a)]),
  kinds: z.array(z.enum(SIGNAL_KINDS)).max(SIGNAL_KINDS.length).transform((a) => [...new Set(a)]),
  includeTerms: terms, requireTerms: terms.pipe(z.array(z.string()).max(8)), excludeTerms: terms,
  accounts: z.array(z.string().trim().toLowerCase().min(1).max(100).transform((v) => v.replace(/^@/, ''))).max(40).transform((a) => [...new Set(a)]),
  minScore: z.number().int().min(0).max(100), delivery: z.enum(['feed', 'digest', 'alert']),
};
export const watchCreate = z.object({ ...Object.fromEntries(Object.entries(watchFields).map(([k, v]) => [k, k === 'name' ? v : v.optional()])) }).strict();
export const watchUpdate = z.object({
  expectedVersion: z.number().int().positive(),
  changes: z.object({ ...Object.fromEntries(Object.entries(watchFields).map(([k, v]) => [k, v.optional()])), archived: z.boolean().optional() })
    .strict().refine((v) => Object.keys(v).length > 0, 'Supply at least one change'),
}).strict();
export const signalVote = z.object({ watchId: z.string().uuid(), signalId: z.string().min(3).max(200), vote: z.union([z.literal(-1), z.literal(0), z.literal(1)]) }).strict();
export const signalPromote = z.object({ signalId: z.string().min(3).max(200), name: z.string().trim().max(200).optional(), actor: member }).strict();
export const signalRefresh = z.object({ sources: z.array(z.enum(SIGNAL_SOURCES)).max(SIGNAL_SOURCES.length).optional() }).strict();
