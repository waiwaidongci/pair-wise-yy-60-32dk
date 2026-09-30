import ky, { HTTPError } from 'ky';
import {
  ActionRequest,
  ActionResponse,
  ConflictResponse,
  WorkbookResponse,
  actionResponseSchema,
  conflictResponseSchema,
  evidenceResponseSchema,
  workbookResponseSchema
} from './schema';

// POST 不由 ky 自动重试，重试逻辑在下方显式实现，以便复用同一请求编号
const client = ky.create({ timeout: 10_000, retry: { limit: 0 } });

export class VersionConflictError extends Error {
  readonly conflict: ConflictResponse;
  constructor(conflict: ConflictResponse) {
    super('VERSION_CONFLICT');
    this.name = 'VersionConflictError';
    this.conflict = conflict;
  }
}

export class WriteFailedError extends Error {
  readonly requestId: string;
  constructor(requestId: string) {
    super('WRITE_FAILED');
    this.name = 'WriteFailedError';
    this.requestId = requestId;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** 生成幂等请求编号；一次用户意图只生成一次，重试必须复用 */
export function newRequestId() {
  const rand = Math.random().toString(36).slice(2, 8);
  return `REQ-${DateNowCompact()}-${rand}`;
}

function DateNowCompact() {
  return Date.now().toString(36);
}

export async function fetchWorkbook(): Promise<WorkbookResponse> {
  const payload = await client.get('/api/evidence').json<unknown>();
  return workbookResponseSchema.parse(payload);
}

export async function fetchEvidence() {
  const payload = await client.get('/api/evidence', { searchParams: { legacy: '1' } }).json<unknown>();
  return evidenceResponseSchema.parse(payload);
}

export type SubmitResult = {
  response: ActionResponse;
  /** 首次 500 后用原请求编号重试才成功（服务端只追加了一条记录） */
  retriedAfterFailure: boolean;
};

/**
 * 提交签字 / 更新。
 * - 写入失败（5xx / 网络）时使用【同一请求编号】重试，绝不换号，避免重复追加核验记录。
 * - 409 版本冲突不重试，交给调用方保留填写内容并展示冲突来源。
 */
export async function submitAction(input: ActionRequest): Promise<SubmitResult> {
  const maxAttempts = 3;
  let retriedAfterFailure = false;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const payload = await client.post('/api/evidence', { json: input }).json<unknown>();
      const response = actionResponseSchema.parse(payload);
      return { response, retriedAfterFailure };
    } catch (error) {
      if (error instanceof HTTPError) {
        const status = error.response.status;
        if (status === 409) {
          const body = conflictResponseSchema.parse(await error.response.json());
          throw new VersionConflictError(body);
        }
        if (status >= 500 && attempt < maxAttempts) {
          retriedAfterFailure = true;
          await sleep(450);
          continue;
        }
        if (status >= 500) {
          throw new WriteFailedError(input.requestId);
        }
        // 400/404 等请求错误：不重试、不伪装成写入失败
        const detail = (await error.response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(detail?.error ?? `REQUEST_FAILED_${status}`);
      }
      if (attempt >= maxAttempts) {
        throw new WriteFailedError(input.requestId);
      }
      retriedAfterFailure = true;
      await sleep(450);
    }
  }
  throw new WriteFailedError(input.requestId);
}
