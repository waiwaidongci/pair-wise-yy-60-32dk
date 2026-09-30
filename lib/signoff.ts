export type SignOffStatus = '有效' | '已失效' | '待复核副本' | '已确认';

export type ChangeSourceType = '抽样范围' | '证据份数' | '排放因子';

export type ChangeSource = {
  type: ChangeSourceType;
  recordId?: string;
  from?: string;
  to?: string;
};

export type SignOffSnapshot = {
  sampledIds: string[];
  evidenceCounts: Record<string, number>;
  factors: Record<string, number>;
  revisions: Record<string, number>;
};

export type SignOff = {
  id: string;
  requestId: string;
  actor: string;
  note: string;
  status: SignOffStatus;
  baseVersion: number;
  snapshot: SignOffSnapshot;
  createdAt: string;
  invalidatedAt?: string;
  sources?: ChangeSource[];
  supersedesId?: string;
  supersededById?: string;
};

export type SignOffState = {
  dataVersion: number;
  signOffs: SignOff[];
};

export function emptySnapshot(): SignOffSnapshot {
  return { sampledIds: [], evidenceCounts: {}, factors: {}, revisions: {} };
}

export function buildSnapshot(
  records: { id: string; evidenceCount: number; factor: number; revision: number }[],
  sampledIds: string[]
): SignOffSnapshot {
  const evidenceCounts: Record<string, number> = {};
  const factors: Record<string, number> = {};
  const revisions: Record<string, number> = {};
  for (const id of sampledIds) {
    const record = records.find((item) => item.id === id);
    if (!record) continue;
    evidenceCounts[id] = record.evidenceCount;
    factors[id] = record.factor;
    revisions[id] = record.revision;
  }
  return { sampledIds: [...sampledIds], evidenceCounts, factors, revisions };
}

export function snapshotSummary(snapshot: SignOffSnapshot): string {
  const sampled = snapshot.sampledIds.length;
  const evidence = Object.values(snapshot.evidenceCounts).reduce((sum, count) => sum + count, 0);
  const revision = Math.max(0, ...Object.values(snapshot.revisions));
  return `抽样 ${sampled} 条 · 证据 ${evidence} 份 · 因子 R${revision}`;
}

export function snapshotDiff(prev: SignOffSnapshot, next: SignOffSnapshot): ChangeSource[] {
  const sources: ChangeSource[] = [];
  const prevSet = new Set(prev.sampledIds);
  const nextSet = new Set(next.sampledIds);
  for (const id of next.sampledIds) {
    if (!prevSet.has(id)) {
      sources.push({ type: '抽样范围', recordId: id, from: '未抽样', to: '已抽样' });
    }
  }
  for (const id of prev.sampledIds) {
    if (!nextSet.has(id)) {
      sources.push({ type: '抽样范围', recordId: id, from: '已抽样', to: '已移除' });
    }
  }
  for (const id of next.sampledIds) {
    const prevEvidence = prev.evidenceCounts[id];
    const nextEvidence = next.evidenceCounts[id];
    if (prevEvidence !== undefined && nextEvidence !== undefined && prevEvidence !== nextEvidence) {
      sources.push({ type: '证据份数', recordId: id, from: String(prevEvidence), to: String(nextEvidence) });
    }
    const prevFactor = prev.factors[id];
    const nextFactor = next.factors[id];
    if (prevFactor !== undefined && nextFactor !== undefined && prevFactor !== nextFactor) {
      sources.push({ type: '排放因子', recordId: id, from: String(prevFactor), to: String(nextFactor) });
    }
  }
  return sources;
}
