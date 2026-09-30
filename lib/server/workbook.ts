import {
  ActionRequest,
  AuditEntry,
  InvalidationSource,
  ReviewCopy,
  Signature,
  VersionEntry,
  WorkbookRecord,
  WorkbookResponse,
  actionRequestSchema
} from '@/lib/schema';

/**
 * 内存中的版本化工作簿（本地演示用单例）。
 *
 * 不变量：
 * 1. 每次被接受的更新 version + 1，并追加一条 versions / audit 记录。
 * 2. 签字时冻结「抽样范围 + 每条证据份数 + 排放因子版本」；之后任一绑定数据更新，
 *    旧签字置为 invalidated（仍保留可查），重算只生成「待复核副本」，不会自动恢复签字。
 * 3. 提交只接纳打开页面时的 baseVersion：版本落后直接返回 VERSION_CONFLICT，
 *    冲突中带回后到版本的变更与失效来源，由前端保留填写内容并提示。
 * 4. requestId 幂等：同一请求编号重试时原样回放首次结果，绝不重复追加核验记录。
 */

const now = () => new Date().toISOString();

const baseRecords: WorkbookRecord[] = [
  { id: 'ACT-0318', source: '电表 E-17 / 四号压缩机组', activity: 428650, unit: 'kWh', factor: 0.5568, factorVersion: 'EF-CNGRID-2024', factorUnit: 'tCO2/MWh', timeRange: '2026-07-01 至 07-31', evidenceCount: 4, anomaly: 2.3, owner: '项目现场 O2', status: '复核中', revision: 3 },
  { id: 'ACT-0321', source: '蒸汽流量计 ST-04', activity: 2038.4, unit: 'GJ', factor: 0.1100, factorVersion: 'EF-STEAM-2024', factorUnit: 'tCO2/GJ', timeRange: '2026-07-01 至 07-31', evidenceCount: 3, anomaly: 0, owner: '能源中心', status: '已核验', revision: 2 },
  { id: 'ACT-0325', source: '柴油消耗台账 / 应急泵', activity: 1846, unit: 'L', factor: 2.6800, factorVersion: 'EF-DIESEL-2024', factorUnit: 'kgCO2/L', timeRange: '2026-07-01 至 07-31', evidenceCount: 2, anomaly: 8.6, owner: '设备保障部', status: '需补证', revision: 4 },
  { id: 'ACT-0331', source: '光伏逆变器阵列 PV-2', activity: 182460, unit: 'kWh', factor: 0.5568, factorVersion: 'EF-CNGRID-2024', factorUnit: 'tCO2/MWh', timeRange: '2026-07-01 至 07-31', evidenceCount: 5, anomaly: -1.2, owner: '新能源运维', status: '已核验', revision: 1 },
  { id: 'ACT-0337', source: '天然气流量计 NG-02', activity: 62.8, unit: 'kNm3', factor: 2.1622, factorVersion: 'EF-NG-2024', factorUnit: 'tCO2/kNm3', timeRange: '2026-07-01 至 07-31', evidenceCount: 1, anomaly: 12.4, owner: '热力站', status: '待核验', revision: 1 }
];

type Workbook = {
  project: WorkbookResponse['project'];
  summary: WorkbookResponse['summary'];
  records: WorkbookRecord[];
  sampledIds: string[];
  version: number;
  signatures: Signature[];
  reviewCopies: ReviewCopy[];
  audit: AuditEntry[];
  versions: VersionEntry[];
};

let seq = 0;
const nextId = (prefix: string) => {
  seq += 1;
  return `${prefix}-${seq.toString().padStart(4, '0')}`;
};

function initialWorkbook(): Workbook {
  return {
    project: {
      id: 'CN-ER-2026-041',
      name: '临港工业园区能效提升项目',
      methodology: 'CMS-052-V01',
      vintage: '2026 监测年度',
      verifier: '华碳认证 · 核验组 B'
    },
    summary: { period: '2026 年第三监测期', reduction: 18426, evidenceRate: 92, openFindings: 3, sampled: 18 },
    records: baseRecords.map((record) => ({ ...record })),
    sampledIds: ['ACT-0318', 'ACT-0337'],
    version: 1,
    signatures: [],
    reviewCopies: [],
    audit: [],
    versions: []
  };
}

const globalForWorkbook = globalThis as unknown as { __yy60Workbook?: Workbook };
const workbook: Workbook = globalForWorkbook.__yy60Workbook ?? initialWorkbook();
globalForWorkbook.__yy60Workbook = workbook;

/** requestId -> 首次处理结果（成功响应或冲突响应），重试时原样回放 */
const idempotencyIndex = new Map<string, ActionResult>();
/** test-only：记录需要制造一次写入失败的请求编号；失败不产生任何追加 */
const failOnce = new Set<string>();

export function getWorkbook(): WorkbookResponse {
  return serialize(workbook);
}

function serialize(wb: Workbook): WorkbookResponse {
  return {
    project: wb.project,
    summary: wb.summary,
    records: wb.records.map((record) => ({ ...record })),
    sampledIds: [...wb.sampledIds],
    version: wb.version,
    signatures: wb.signatures.map((signature) => ({
      ...signature,
      frozen: signature.frozen.map((entry) => ({ ...entry })),
      frozenSampleIds: [...signature.frozenSampleIds],
      invalidationSources: signature.invalidationSources.map((source) => ({ ...source }))
    })),
    reviewCopies: wb.reviewCopies.map((copy) => ({
      ...copy,
      sources: copy.sources.map((source) => ({ ...source }))
    })),
    audit: wb.audit.map((entry) => ({ ...entry })),
    versions: wb.versions.map((entry) => ({ ...entry }))
  };
}

export type ActionResult =
  | { status: 200; body: unknown }
  | { status: 400; body: unknown }
  | { status: 404; body: unknown }
  | { status: 409; body: unknown };

/**
 * 处理一次签字 / 更新提交。
 * 返回 {status, body} 供路由层使用；幂等命中时回放首次结果。
 */
export function applyAction(raw: unknown): ActionResult {
  const parsed = actionRequestSchema.safeParse(raw);
  if (!parsed.success) {
    return { status: 400, body: { error: 'BAD_REQUEST', issues: parsed.error.issues } };
  }
  const req = parsed.data;

  // 幂等优先：同一请求编号在首次结果（成功/冲突）之后的任何重试都原样回放，
  // 不再触发失败模拟，也不会重复追加核验记录
  if (idempotencyIndex.has(req.requestId)) {
    const cached = idempotencyIndex.get(req.requestId)!;
    if (cached.status === 200) {
      const body = cached.body as { workbook: WorkbookResponse; replayed: boolean };
      return { status: 200, body: { ...body, replayed: true } };
    }
    return { status: cached.status, body: cached.body };
  }

  // 写入失败演练：该请求编号的【首次】处理直接失败、不留痕；用原编号重试可正常提交
  if (req.simulate === 'write-error') {
    if (!failOnce.has(req.requestId)) {
      failOnce.add(req.requestId);
      throw new Error('SIMULATED_WRITE_FAILURE');
    }
    failOnce.delete(req.requestId);
  }

  // 乐观并发：只接纳打开页面时的版本；落后即冲突（冲突本身按 requestId 幂等缓存）
  if (req.baseVersion !== workbook.version) {
    const result: ActionResult = { status: 409, body: buildConflict(req.baseVersion) };
    idempotencyIndex.set(req.requestId, result);
    return result;
  }

  const result = dispatch(req);
  idempotencyIndex.set(req.requestId, result);
  return result;
}

function buildConflict(baseVersion: number) {
  return {
    error: 'VERSION_CONFLICT' as const,
    currentVersion: workbook.version,
    baseVersion,
    changes: workbook.versions.filter((entry) => entry.version > baseVersion),
    activeSignatures: workbook.signatures.filter((signature) => signature.status === 'active'),
    invalidatedSignatures: workbook.signatures.filter((signature) => signature.status === 'invalidated'),
    pendingCopies: workbook.reviewCopies.filter((copy) => copy.status === '待复核')
  };
}

function dispatch(req: ActionRequest): ActionResult {
  switch (req.kind) {
    case 'sign':
      return doSign(req);
    case 'resign':
      return doResign(req);
    case 'evidence':
      return doEvidenceUpdate(req);
    case 'factor':
      return doFactorUpdate(req);
    case 'sample':
      return doSampleUpdate(req);
  }
}

function buildFrozen(sampleIds: string[]) {
  return workbook.records
    .filter((record) => sampleIds.includes(record.id))
    .map((record) => ({ recordId: record.id, evidenceCount: record.evidenceCount, factorVersion: record.factorVersion }));
}

/** 对比签字冻结快照与当前数据，找出所有失效来源 */
function diffSignature(signature: Signature): InvalidationSource[] {
  const sources: InvalidationSource[] = [];

  const added = workbook.sampledIds.filter((id) => !signature.frozenSampleIds.includes(id));
  const removed = signature.frozenSampleIds.filter((id) => !workbook.sampledIds.includes(id));
  if (added.length || removed.length) {
    sources.push({
      kind: 'sample',
      recordId: [...added, ...removed].join(',') || '抽样范围',
      detail: `抽样范围变化：新增 ${added.length} 项、移除 ${removed.length} 项`,
      fromVersion: signature.baseVersion,
      toVersion: workbook.version
    });
  }

  for (const frozen of signature.frozen) {
    const record = workbook.records.find((item) => item.id === frozen.recordId);
    if (!record) {
      continue;
    }
    if (record.evidenceCount !== frozen.evidenceCount) {
      sources.push({
        kind: 'evidence',
        recordId: record.id,
        detail: `证据份数 ${frozen.evidenceCount} → ${record.evidenceCount}（现场补证）`,
        fromVersion: signature.baseVersion,
        toVersion: workbook.version
      });
    }
    if (record.factorVersion !== frozen.factorVersion) {
      sources.push({
        kind: 'factor',
        recordId: record.id,
        detail: `排放因子版本 ${frozen.factorVersion} → ${record.factorVersion}`,
        fromVersion: signature.baseVersion,
        toVersion: workbook.version
      });
    }
  }
  return sources;
}

/**
 * 绑定数据更新后重算：active 签字失效，每个失效签字只生成一份待复核副本；
 * 原签字保留可查，签发绿灯只认 active 签字。
 */
function invalidateAffected() {
  const invalidatedSignatureIds: string[] = [];
  const copyIds: string[] = [];

  for (const signature of workbook.signatures) {
    if (signature.status !== 'active') {
      continue;
    }
    const sources = diffSignature(signature);
    if (sources.length === 0) {
      continue;
    }
    signature.status = 'invalidated';
    signature.invalidatedAt = now();
    signature.invalidationSources = sources;
    invalidatedSignatureIds.push(signature.id);

    // 同一失效签字在其生命周期内只保留一份待复核副本，避免重复追加
    const exists = workbook.reviewCopies.some(
      (copy) => copy.signatureId === signature.id && copy.status === '待复核'
    );
    if (!exists) {
      const copy: ReviewCopy = {
        id: nextId('RC'),
        signatureId: signature.id,
        signer: signature.signer,
        comment: signature.comment,
        fromVersion: signature.baseVersion,
        createdAt: now(),
        status: '待复核',
        sources,
        resolvedBySignatureId: null
      };
      workbook.reviewCopies.unshift(copy);
      copyIds.push(copy.id);
    }
  }

  if (invalidatedSignatureIds.length > 0) {
    // 失效重算是同一次写入的连锁结果：并入最后一条审计记录，保证一个 requestId 只追加一条
    const lastAudit = workbook.audit[workbook.audit.length - 1];
    if (lastAudit) {
      lastAudit.detail += `；触发重算：签字 ${invalidatedSignatureIds.join('、')} 失效，生成待复核副本 ${copyIds.join('、')}`;
    }
  }
  return { invalidatedSignatureIds, copyIds };
}

function bump(kind: VersionEntry['kind'], actor: string, detail: string) {
  workbook.version += 1;
  workbook.versions.push({ version: workbook.version, at: now(), actor, kind, detail });
}

function doSign(req: ActionRequest): ActionResult {
  const signer = req.signer?.trim() || req.actor;
  const comment = req.comment?.trim() || '';
  const sampled = workbook.sampledIds;
  const signature: Signature = {
    id: nextId('SIG'),
    requestId: req.requestId,
    signer,
    comment,
    baseVersion: workbook.version,
    signedAt: now(),
    status: 'active',
    frozen: buildFrozen(sampled),
    frozenSampleIds: [...sampled],
    invalidatedAt: null,
    invalidationSources: []
  };
  workbook.signatures.unshift(signature);
  workbook.audit.push({
    id: nextId('AUD'),
    requestId: req.requestId,
    kind: 'sign',
    actor: signer,
    detail: `签字冻结抽样范围 ${sampled.length} 项、证据份数与因子版本（V${workbook.version}）`,
    baseVersion: signature.baseVersion,
    version: workbook.version,
    at: signature.signedAt,
    replayed: false
  });

  return {
    status: 200,
    body: {
      workbook: serialize(workbook),
      replayed: false,
      effect: { signature, invalidatedSignatureIds: [], copyIds: [], version: workbook.version }
    }
  };
}

/** 基于待复核副本重新签字：沿用副本中保留的填写内容，对当前版本重新冻结 */
function doResign(req: ActionRequest): ActionResult {
  const copy = workbook.reviewCopies.find((item) => item.id === req.copyId);
  if (!copy || copy.status !== '待复核') {
    return { status: 404, body: { error: 'COPY_NOT_FOUND', copyId: req.copyId ?? null } };
  }
  const signer = req.signer?.trim() || copy.signer;
  const comment = req.comment?.trim() || copy.comment;
  const sampled = workbook.sampledIds;
  const signature: Signature = {
    id: nextId('SIG'),
    requestId: req.requestId,
    signer,
    comment,
    baseVersion: workbook.version,
    signedAt: now(),
    status: 'active',
    frozen: buildFrozen(sampled),
    frozenSampleIds: [...sampled],
    invalidatedAt: null,
    invalidationSources: []
  };
  workbook.signatures.unshift(signature);
  copy.status = '已复核';
  copy.resolvedBySignatureId = signature.id;
  workbook.audit.push({
    id: nextId('AUD'),
    requestId: req.requestId,
    kind: 'sign',
    actor: signer,
    detail: `依据待复核副本 ${copy.id} 重新签字（V${workbook.version}），原签字 ${copy.signatureId} 仍可查`,
    baseVersion: signature.baseVersion,
    version: workbook.version,
    at: signature.signedAt,
    replayed: false
  });

  return {
    status: 200,
    body: {
      workbook: serialize(workbook),
      replayed: false,
      effect: { signature, invalidatedSignatureIds: [], copyIds: [copy.id], version: workbook.version }
    }
  };
}

function doEvidenceUpdate(req: ActionRequest): ActionResult {
  const record = workbook.records.find((item) => item.id === req.recordId);
  if (!record || !req.addCount) {
    return { status: 400, body: { error: 'BAD_REQUEST', detail: 'recordId 与 addCount 必填' } };
  }
  const baseVersion = workbook.version;
  const before = record.evidenceCount;
  record.evidenceCount += req.addCount;
  record.revision += 1;
  bump('evidence', req.actor, `现场补证：${record.id} 证据份数 ${before} → ${record.evidenceCount}${req.reason ? `（${req.reason}）` : ''}`);
  workbook.audit.push({
    id: nextId('AUD'),
    requestId: req.requestId,
    kind: 'evidence',
    actor: req.actor,
    detail: `${record.id} 现场补证 +${req.addCount} 份，证据 ${before} → ${record.evidenceCount}`,
    baseVersion,
    version: workbook.version,
    at: now(),
    replayed: false
  });
  const invalidation = invalidateAffected();

  return {
    status: 200,
    body: {
      workbook: serialize(workbook),
      replayed: false,
      effect: { ...invalidation, version: workbook.version }
    }
  };
}

function doFactorUpdate(req: ActionRequest): ActionResult {
  const record = workbook.records.find((item) => item.id === req.recordId);
  if (!record || !req.factor || !req.factorVersion) {
    return { status: 400, body: { error: 'BAD_REQUEST', detail: 'recordId、factor 与 factorVersion 必填' } };
  }
  const baseVersion = workbook.version;
  const beforeVersion = record.factorVersion;
  const beforeValue = record.factor;
  record.factor = req.factor;
  record.factorVersion = req.factorVersion;
  record.revision += 1;
  bump('factor', req.actor, `排放因子更新：${record.id} ${beforeVersion} → ${req.factorVersion}${req.reason ? `（${req.reason}）` : ''}`);
  workbook.audit.push({
    id: nextId('AUD'),
    requestId: req.requestId,
    kind: 'factor',
    actor: req.actor,
    detail: `${record.id} 因子 ${beforeValue}（${beforeVersion}）→ ${req.factor}（${req.factorVersion}）`,
    baseVersion,
    version: workbook.version,
    at: now(),
    replayed: false
  });
  const invalidation = invalidateAffected();

  return {
    status: 200,
    body: {
      workbook: serialize(workbook),
      replayed: false,
      effect: { ...invalidation, version: workbook.version }
    }
  };
}

function doSampleUpdate(req: ActionRequest): ActionResult {
  if (!req.sampledIds || req.sampledIds.some((id) => !workbook.records.some((record) => record.id === id))) {
    return { status: 400, body: { error: 'BAD_REQUEST', detail: 'sampledIds 含未知记录' } };
  }
  const baseVersion = workbook.version;
  const before = [...workbook.sampledIds];
  workbook.sampledIds = [...new Set(req.sampledIds)];
  bump('sample', req.actor, `抽样范围调整：${before.length} 项 → ${workbook.sampledIds.length} 项${req.reason ? `（${req.reason}）` : ''}`);
  workbook.audit.push({
    id: nextId('AUD'),
    requestId: req.requestId,
    kind: 'sample',
    actor: req.actor,
    detail: `抽样范围 ${before.join('、') || '空'} → ${workbook.sampledIds.join('、') || '空'}`,
    baseVersion,
    version: workbook.version,
    at: now(),
    replayed: false
  });
  const invalidation = invalidateAffected();

  return {
    status: 200,
    body: {
      workbook: serialize(workbook),
      replayed: false,
      effect: { ...invalidation, version: workbook.version }
    }
  };
}

/** 测试辅助：重置内存状态 */
export function resetWorkbook() {
  const fresh = initialWorkbook();
  workbook.project = fresh.project;
  workbook.summary = fresh.summary;
  workbook.records = fresh.records;
  workbook.sampledIds = fresh.sampledIds;
  workbook.version = fresh.version;
  workbook.signatures = fresh.signatures;
  workbook.reviewCopies = fresh.reviewCopies;
  workbook.audit = fresh.audit;
  workbook.versions = fresh.versions;
  idempotencyIndex.clear();
  failOnce.clear();
}
