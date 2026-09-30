'use client';

import { useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchWorkbook, newRequestId, submitAction, VersionConflictError, WriteFailedError } from './api';
import type { ActionKind, ActionRequest, ActionResponse } from './schema';
import { useCarbonStore } from './store';

export const workbookQueryKey = ['workbook'] as const;

export function useWorkbook() {
  return useQuery({ queryKey: workbookQueryKey, queryFn: fetchWorkbook });
}

export type SubmitInput = {
  kind: ActionKind;
  /** 该动作所基于的版本：签字/重签用页面打开时冻结的基线版本 */
  baseVersion: number;
  /** 待重试请求必须复用原编号；新意图不传则生成 */
  requestId?: string;
  payload?: Partial<ActionRequest>;
  /** 冲突后仍需保留的填写内容所在的草稿类型 */
  keepDraft?: 'sign' | 'sample';
  successText?: string;
};

export function useWorkbookActions() {
  const queryClient = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const store = useCarbonStore();

  const run = useCallback(async (input: SubmitInput): Promise<ActionResponse | null> => {
    const requestId = input.requestId ?? newRequestId();
    const request: ActionRequest = {
      kind: input.kind,
      requestId,
      actor: useCarbonStore.getState().actor,
      baseVersion: input.baseVersion,
      simulate: useCarbonStore.getState().simulateWriteError ? 'write-error' : undefined,
      ...input.payload
    } as ActionRequest;

    setSubmitting(true);
    store.setNotice(null);
    try {
      const { response, retriedAfterFailure } = await submitAction(request);

      if (response.replayed) {
        // 回放的是首次结果：重新拉取当前工作簿，避免用历史快照覆盖显示
        await queryClient.invalidateQueries({ queryKey: workbookQueryKey });
      } else {
        queryClient.setQueryData(workbookQueryKey, response.workbook);
        await queryClient.invalidateQueries({ queryKey: workbookQueryKey });
      }

      // 基线一律以刷新后的当前工作簿为准（回放快照可能是历史版本，不能让基线倒退）
      const fresh = queryClient.getQueryData<typeof response.workbook>(workbookQueryKey);
      store.reopenAtCurrent(fresh?.version ?? response.workbook.version);
      store.setPendingRetry(null, null);
      store.setLastRequest({
        requestId,
        kind: input.kind,
        replayed: response.replayed,
        retriedAfterFailure,
        at: new Date().toISOString()
      });

      if (input.kind === 'sign' || input.kind === 'resign') {
        store.setSignDraft('');
      }
      if (input.kind === 'sample') {
        store.setSampleDraft(null);
      }

      const replayNote = response.replayed
        ? '请求编号命中首次结果（回放），未重复追加核验记录。'
        : retriedAfterFailure
          ? '首次写入失败，已使用【原请求编号】重试成功，核验记录仅追加一次。'
          : '';
      store.setNotice({
        severity: response.replayed || retriedAfterFailure ? 'warning' : 'success',
        text: input.successText ?? '提交已接纳，版本已推进。' + (replayNote ? ` ${replayNote}` : '')
      });
      return response;
    } catch (error) {
      if (error instanceof VersionConflictError) {
        // 关键：只清空冲突状态，signDraft / sampleDraft 原样保留
        store.setConflict(error.conflict);
        queryClient.invalidateQueries({ queryKey: workbookQueryKey });
        store.setNotice({
          severity: 'warning',
          text: `版本冲突：本页基线 V${error.conflict.baseVersion}，当前已为 V${error.conflict.currentVersion}。填写内容已保留，请查看冲突来源后基于当前版本继续。`
        });
        return null;
      }
      if (error instanceof WriteFailedError) {
        // 保留完整原请求（含原请求编号），等待显式重试
        store.setPendingRetry(request, '写入失败（已自动重试仍未成功），请使用原请求编号重试，不会产生重复核验记录。');
        store.setNotice({ severity: 'error', text: `写入失败，请求编号 ${requestId} 已保留，可重试。` });
        return null;
      }
      store.setNotice({ severity: 'error', text: error instanceof Error ? `提交被拒绝：${error.message}` : '提交失败。' });
      return null;
    } finally {
      setSubmitting(false);
    }
  }, [queryClient, store]);

  const retryPending = useCallback(async (): Promise<ActionResponse | null> => {
    const pending = useCarbonStore.getState().pendingRequest;
    if (!pending) {
      return null;
    }
    // 重试时强制取消失败模拟：同一编号在服务端的首次失败已消耗
    const { simulate: _simulate, ...rest } = pending;
    return run({
      kind: pending.kind,
      baseVersion: pending.baseVersion,
      requestId: pending.requestId,
      payload: rest,
      successText: '已使用原请求编号重试成功，核验记录未重复追加。'
    });
  }, [run]);

  return { submit: run, retryPending, submitting };
}
