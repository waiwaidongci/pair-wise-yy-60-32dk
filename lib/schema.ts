import { z } from 'zod';

/** 绑定到同一版本的三类数据：抽样范围、证据份数、排放因子版本 */
export const frozenEntrySchema = z.object({
  recordId: z.string(),
  evidenceCount: z.number(),
  factorVersion: z.string()
});
export type FrozenEntry = z.infer<typeof frozenEntrySchema>;

export const invalidationSourceSchema = z.object({
  kind: z.enum(['evidence', 'factor', 'sample']),
  recordId: z.string(),
  detail: z.string(),
  fromVersion: z.number(),
  toVersion: z.number()
});
export type InvalidationSource = z.infer<typeof invalidationSourceSchema>;

export const signatureSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  signer: z.string(),
  comment: z.string(),
  baseVersion: z.number(),
  signedAt: z.string(),
  /** active：当前签字有效；invalidated：绑定数据已更新，签字失效（原签字仍可查） */
  status: z.enum(['active', 'invalidated']),
  frozen: z.array(frozenEntrySchema),
  frozenSampleIds: z.array(z.string()),
  invalidatedAt: z.string().nullable(),
  invalidationSources: z.array(invalidationSourceSchema)
});
export type Signature = z.infer<typeof signatureSchema>;

/** 旧签字失效后生成的待复核副本：保留填写内容，等待重新签字复核 */
export const reviewCopySchema = z.object({
  id: z.string(),
  signatureId: z.string(),
  signer: z.string(),
  comment: z.string(),
  fromVersion: z.number(),
  createdAt: z.string(),
  status: z.enum(['待复核', '已复核']),
  sources: z.array(invalidationSourceSchema),
  resolvedBySignatureId: z.string().nullable()
});
export type ReviewCopy = z.infer<typeof reviewCopySchema>;

export const auditEntrySchema = z.object({
  id: z.string(),
  requestId: z.string(),
  kind: z.enum(['sign', 'evidence', 'factor', 'sample']),
  actor: z.string(),
  detail: z.string(),
  baseVersion: z.number().nullable(),
  version: z.number(),
  at: z.string(),
  replayed: z.boolean()
});
export type AuditEntry = z.infer<typeof auditEntrySchema>;

export const versionEntrySchema = z.object({
  version: z.number(),
  at: z.string(),
  actor: z.string(),
  kind: z.enum(['evidence', 'factor', 'sample']),
  detail: z.string()
});
export type VersionEntry = z.infer<typeof versionEntrySchema>;

export const workbookRecordSchema = z.object({
  id: z.string(),
  source: z.string(),
  activity: z.number(),
  unit: z.string(),
  factor: z.number(),
  factorVersion: z.string(),
  factorUnit: z.string(),
  timeRange: z.string(),
  evidenceCount: z.number(),
  anomaly: z.number(),
  owner: z.string(),
  status: z.enum(['待核验', '复核中', '已核验', '需补证']),
  revision: z.number()
});
export type WorkbookRecord = z.infer<typeof workbookRecordSchema>;

export const workbookResponseSchema = z.object({
  project: z.object({
    id: z.string(),
    name: z.string(),
    methodology: z.string(),
    vintage: z.string(),
    verifier: z.string()
  }),
  summary: z.object({
    period: z.string(),
    reduction: z.number(),
    evidenceRate: z.number(),
    openFindings: z.number(),
    sampled: z.number()
  }),
  records: z.array(workbookRecordSchema),
  sampledIds: z.array(z.string()),
  version: z.number(),
  signatures: z.array(signatureSchema),
  reviewCopies: z.array(reviewCopySchema),
  audit: z.array(auditEntrySchema),
  versions: z.array(versionEntrySchema)
});
export type WorkbookResponse = z.infer<typeof workbookResponseSchema>;

export const actionKindSchema = z.enum(['sign', 'resign', 'evidence', 'factor', 'sample']);
export type ActionKind = z.infer<typeof actionKindSchema>;

export const actionRequestSchema = z.object({
  kind: actionKindSchema,
  requestId: z.string().min(1),
  actor: z.string().min(1),
  baseVersion: z.number().int().nonnegative(),
  signer: z.string().optional(),
  comment: z.string().optional(),
  copyId: z.string().optional(),
  recordId: z.string().optional(),
  addCount: z.number().int().positive().optional(),
  factor: z.number().positive().optional(),
  factorVersion: z.string().optional(),
  reason: z.string().optional(),
  sampledIds: z.array(z.string()).optional(),
  /** test-only：首次处理该请求编号时模拟一次 500 写入失败，重试同一编号可成功且不重复追加 */
  simulate: z.enum(['write-error']).optional()
});
export type ActionRequest = z.infer<typeof actionRequestSchema>;

export const conflictResponseSchema = z.object({
  error: z.literal('VERSION_CONFLICT'),
  currentVersion: z.number(),
  baseVersion: z.number(),
  /** 让后到的核验员看到冲突与失效来源 */
  changes: z.array(versionEntrySchema),
  activeSignatures: z.array(signatureSchema),
  invalidatedSignatures: z.array(signatureSchema),
  pendingCopies: z.array(reviewCopySchema)
});
export type ConflictResponse = z.infer<typeof conflictResponseSchema>;

export const actionResponseSchema = z.object({
  workbook: workbookResponseSchema,
  replayed: z.boolean(),
  effect: z.object({
    signature: signatureSchema.optional(),
    invalidatedSignatureIds: z.array(z.string()).optional(),
    copyIds: z.array(z.string()).optional(),
    version: z.number()
  })
});
export type ActionResponse = z.infer<typeof actionResponseSchema>;

/** 旧接口保留，供首屏概览兜底使用 */
export const evidenceResponseSchema = z.object({
  project: z.object({
    id: z.string(),
    name: z.string(),
    methodology: z.string(),
    vintage: z.string(),
    verifier: z.string()
  }),
  summary: z.object({
    period: z.string(),
    reduction: z.number(),
    evidenceRate: z.number(),
    openFindings: z.number(),
    sampled: z.number()
  }),
  records: z.array(z.object({
    id: z.string(),
    source: z.string(),
    activity: z.number(),
    unit: z.string(),
    factor: z.number(),
    factorUnit: z.string(),
    timeRange: z.string(),
    evidenceCount: z.number(),
    anomaly: z.number(),
    owner: z.string(),
    status: z.enum(['待核验', '复核中', '已核验', '需补证']),
    revision: z.number()
  }))
});

export type EvidenceResponse = z.infer<typeof evidenceResponseSchema>;
