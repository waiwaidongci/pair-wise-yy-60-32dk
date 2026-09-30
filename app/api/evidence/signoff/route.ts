import { NextResponse } from 'next/server';
import { buildSnapshot, type ChangeSource, type SignOff, type SignOffSnapshot } from '@/lib/signoff';

type ProcessedEntry = { status: number; body: unknown };

type StoredState = {
  dataVersion: number;
  current: SignOffSnapshot;
  signOffs: SignOff[];
  changeLog: { version: number; sources: ChangeSource[] }[];
  processed: Map<string, ProcessedEntry>;
};

const defaultRecords = [
  { id: 'ACT-0318', evidenceCount: 4, factor: 0.5568, revision: 3 },
  { id: 'ACT-0321', evidenceCount: 3, factor: 0.11, revision: 2 },
  { id: 'ACT-0325', evidenceCount: 2, factor: 2.68, revision: 4 },
  { id: 'ACT-0331', evidenceCount: 5, factor: 0.5568, revision: 1 },
  { id: 'ACT-0337', evidenceCount: 1, factor: 2.1622, revision: 1 }
];

const defaultSampledIds = ['ACT-0318', 'ACT-0337'];

function getState(): StoredState {
  const globalStore = globalThis as unknown as { __signoffState?: StoredState };
  if (!globalStore.__signoffState) {
    globalStore.__signoffState = {
      dataVersion: 1,
      current: buildSnapshot(defaultRecords, defaultSampledIds),
      signOffs: [],
      changeLog: [],
      processed: new Map()
    };
  }
  return globalStore.__signoffState;
}

function newId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function replay(entry: ProcessedEntry) {
  return NextResponse.json(entry.body, { status: entry.status });
}

export async function GET() {
  const state = getState();
  return NextResponse.json({ dataVersion: state.dataVersion, signOffs: state.signOffs });
}

export async function POST(request: Request) {
  const body = await request.json() as {
    op?: 'sign' | 'change';
    requestId?: string;
    actor?: string;
    note?: string;
    baseVersion?: number;
    snapshot?: SignOffSnapshot;
    sources?: ChangeSource[];
    supersedesId?: string;
    failOnce?: boolean;
  };
  const state = getState();

  if (body.op === 'change') {
    const requestId = body.requestId;
    if (requestId && state.processed.has(requestId)) return replay(state.processed.get(requestId)!);

    const nextSnapshot = body.snapshot ?? state.current;
    const sources = body.sources ?? [];
    state.dataVersion += 1;
    state.current = nextSnapshot;
    state.changeLog.push({ version: state.dataVersion, sources });
    const now = new Date().toISOString();
    const invalidated: string[] = [];
    const drafts: SignOff[] = [];

    for (const sign of state.signOffs) {
      if (sign.status !== '有效') continue;
      const affects = sources.some((source) =>
        source.type === '抽样范围'
          ? true
          : source.recordId != null && sign.snapshot.sampledIds.includes(source.recordId)
      );
      if (!affects) continue;
      sign.status = '已失效';
      sign.invalidatedAt = now;
      sign.sources = [...(sign.sources ?? []), ...sources];
      invalidated.push(sign.id);
      const draft: SignOff = {
        id: newId('SO-DRAFT'),
        requestId: newId('REQ'),
        actor: sign.actor,
        note: sign.note,
        status: '待复核副本',
        baseVersion: state.dataVersion,
        snapshot: nextSnapshot,
        createdAt: now,
        sources,
        supersedesId: sign.id
      };
      sign.supersededById = draft.id;
      drafts.push(draft);
    }

    state.signOffs.push(...drafts);
    const responseBody = { version: state.dataVersion, invalidated, drafts };
    if (requestId) state.processed.set(requestId, { status: 200, body: responseBody });
    return NextResponse.json(responseBody, { status: 200 });
  }

  const requestId = body.requestId ?? newId('REQ');
  const actor = body.actor ?? '核验员';
  const note = body.note ?? '';
  const baseVersion = body.baseVersion ?? state.dataVersion;
  const submittedSnapshot = body.snapshot ?? state.current;

  if (state.processed.has(requestId)) return replay(state.processed.get(requestId)!);

  const now = new Date().toISOString();

  if (body.failOnce) {
    const sign: SignOff = {
      id: newId('SO'),
      requestId,
      actor,
      note,
      status: '有效',
      baseVersion,
      snapshot: submittedSnapshot,
      createdAt: now
    };
    state.signOffs.push(sign);
    const responseBody = { ok: true, signOff: sign };
    state.processed.set(requestId, { status: 201, body: responseBody });
    return NextResponse.json({ ok: false, error: '写入确认丢失', requestId }, { status: 500 });
  }

  if (baseVersion !== state.dataVersion) {
    const sources = state.changeLog
      .filter((entry) => entry.version > baseVersion)
      .flatMap((entry) => entry.sources);
    const draft: SignOff = {
      id: newId('SO-DRAFT'),
      requestId,
      actor,
      note,
      status: '待复核副本',
      baseVersion: state.dataVersion,
      snapshot: state.current,
      createdAt: now,
      sources,
      supersedesId: body.supersedesId
    };
    state.signOffs.push(draft);
    const responseBody = { ok: false, conflict: true, currentVersion: state.dataVersion, baseVersion, sources, draft };
    state.processed.set(requestId, { status: 409, body: responseBody });
    return NextResponse.json(responseBody, { status: 409 });
  }

  const sign: SignOff = {
    id: newId('SO'),
    requestId,
    actor,
    note,
    status: '有效',
    baseVersion,
    snapshot: submittedSnapshot,
    createdAt: now
  };
  if (body.supersedesId) {
    const previous = state.signOffs.find((item) => item.id === body.supersedesId);
    if (previous) {
      previous.status = '已确认';
      previous.supersededById = sign.id;
      sign.supersedesId = previous.id;
    }
  }
  state.signOffs.push(sign);
  const responseBody = { ok: true, signOff: sign };
  state.processed.set(requestId, { status: 201, body: responseBody });
  return NextResponse.json(responseBody, { status: 201 });
}
