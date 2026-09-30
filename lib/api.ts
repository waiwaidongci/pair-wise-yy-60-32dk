import ky, { HTTPError } from 'ky';
import { evidenceResponseSchema } from './schema';
import type { ChangeSource, SignOff, SignOffSnapshot, SignOffState } from './signoff';

const client = ky.create({ timeout: 10_000, retry: { limit: 0 } });

export async function fetchEvidence() {
  const payload = await client.get('/api/evidence').json<unknown>();
  return evidenceResponseSchema.parse(payload);
}

export async function submitEvidenceCorrection(payload: { recordId: string; value: number; reason: string; actor: string }) {
  const response = await client.post('/api/evidence', { json: payload }).json<{ accepted: boolean; revision: number; recordedAt: string }>();
  return response;
}

export async function fetchSignOffs(): Promise<SignOffState> {
  return client.get('/api/evidence/signoff').json<SignOffState>();
}

export type SignSubmitResult =
  | { kind: 'signed'; signOff: SignOff }
  | { kind: 'conflict'; currentVersion: number; baseVersion: number; sources: ChangeSource[]; draft: SignOff };

export async function submitSignOff(payload: {
  requestId: string;
  actor: string;
  note: string;
  baseVersion: number;
  snapshot: SignOffSnapshot;
  supersedesId?: string;
  failOnce?: boolean;
}): Promise<SignSubmitResult> {
  try {
    const response = await client.post('/api/evidence/signoff', { json: payload });
    const body = await response.json<{ ok: true; signOff: SignOff }>();
    return { kind: 'signed', signOff: body.signOff };
  } catch (error) {
    if (error instanceof HTTPError && error.response.status === 409) {
      const body = await error.response.json<{
        currentVersion: number;
        baseVersion: number;
        sources: ChangeSource[];
        draft: SignOff;
      }>();
      return { kind: 'conflict', currentVersion: body.currentVersion, baseVersion: body.baseVersion, sources: body.sources, draft: body.draft };
    }
    throw error;
  }
}

export async function registerDataChange(payload: {
  requestId: string;
  sources: ChangeSource[];
  snapshot: SignOffSnapshot;
}): Promise<{ version: number; invalidated: string[]; drafts: SignOff[] }> {
  return client.post('/api/evidence/signoff', { json: { op: 'change', ...payload } }).json();
}
