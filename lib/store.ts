import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ActionRequest, ConflictResponse } from './schema';

export type RecordStatus = '待核验' | '复核中' | '已核验' | '需补证';

export type Finding = {
  id: string;
  recordId: string;
  type: '缺失证据' | '单位不一致' | '时间范围' | '异常波动';
  title: string;
  detail: string;
  assignee: string;
  due: string;
  status: '开放' | '补证中' | '已关闭';
};

const defaultFindings: Finding[] = [
  { id: 'F-104', recordId: 'ACT-0337', type: '缺失证据', title: '缺少天然气流量计校验证书', detail: '计量记录已提交，但校准有效期证明不足。', assignee: '热力站 · 韩跃', due: '09-30', status: '开放' },
  { id: 'F-105', recordId: 'ACT-0325', type: '异常波动', title: '柴油消耗较上期上升 18.6%', detail: '项目方尚未说明测试运行时长变化。', assignee: '设备保障部 · 姜婷', due: '10-02', status: '补证中' },
  { id: 'F-106', recordId: 'ACT-0318', type: '单位不一致', title: '原始表单位为 MWh，台账记录为 kWh', detail: '需补充单位换算链并保留原始记录。', assignee: '项目现场 · 徐璐', due: '09-30', status: '开放' }
];

export type LastRequest = {
  requestId: string;
  kind: ActionRequest['kind'];
  /** 服务端识别为同一请求编号的回放（未重复追加核验记录） */
  replayed: boolean;
  /** 首次写入失败后，用【原请求编号】重试成功 */
  retriedAfterFailure: boolean;
  at: string;
};

type SessionState = {
  findings: Finding[];
  /** 当前操作的核验员（用于演示两名核验员并发） */
  actor: string;
  /** 打开签字页面时冻结的版本：提交只接纳这个版本 */
  baseVersion: number | null;
  baseVersionAt: string | null;
  /** 签字意见草稿：冲突后仍保留所填写内容 */
  signDraft: string;
  conflict: ConflictResponse | null;
  /** 抽样范围草稿：冲突后同样保留 */
  sampleDraft: string[] | null;
  /** 签发页中仍由人工确认的门禁 */
  manualChecks: { calculation: boolean; methodology: boolean };
  /** 下次提交是否模拟一次写入失败（验证同请求编号重试） */
  simulateWriteError: boolean;
  /** 写入彻底失败时暂存原请求，供“用原请求编号重试” */
  pendingRequest: ActionRequest | null;
  pendingError: string | null;
  lastRequest: LastRequest | null;
  notice: { severity: 'success' | 'info' | 'warning' | 'error'; text: string } | null;

  requestEvidence: (findingId: string) => void;
  closeFinding: (findingId: string) => void;
  setActor: (actor: string) => void;
  captureBaseVersion: (version: number) => void;
  setSignDraft: (text: string) => void;
  setConflict: (conflict: ConflictResponse | null) => void;
  setSampleDraft: (ids: string[] | null) => void;
  toggleManualCheck: (id: 'calculation' | 'methodology') => void;
  toggleSimulateWriteError: () => void;
  setPendingRetry: (request: ActionRequest | null, error: string | null) => void;
  setLastRequest: (request: LastRequest | null) => void;
  setNotice: (notice: SessionState['notice']) => void;
  /** 相当于重新打开签字页面：以当前版本为新基线，填写内容继续保留 */
  reopenAtCurrent: (version: number) => void;
};

export const useCarbonStore = create<SessionState>()(
  persist(
    (set) => ({
      findings: defaultFindings,
      actor: '沈楠',
      baseVersion: null,
      baseVersionAt: null,
      signDraft: '',
      conflict: null,
      sampleDraft: null,
      manualChecks: { calculation: false, methodology: false },
      simulateWriteError: false,
      pendingRequest: null,
      pendingError: null,
      lastRequest: null,
      notice: null,
      requestEvidence: (findingId) => set((state) => ({ findings: state.findings.map((finding) => finding.id === findingId ? { ...finding, status: '补证中' } : finding) })),
      closeFinding: (findingId) => set((state) => ({ findings: state.findings.map((finding) => finding.id === findingId ? { ...finding, status: '已关闭' } : finding) })),
      setActor: (actor) => set({ actor }),
      captureBaseVersion: (version) => set({ baseVersion: version, baseVersionAt: new Date().toISOString(), conflict: null }),
      setSignDraft: (text) => set({ signDraft: text }),
      setConflict: (conflict) => set({ conflict }),
      setSampleDraft: (ids) => set({ sampleDraft: ids }),
      toggleManualCheck: (id) => set((state) => ({ manualChecks: { ...state.manualChecks, [id]: !state.manualChecks[id] } })),
      toggleSimulateWriteError: () => set((state) => ({ simulateWriteError: !state.simulateWriteError })),
      setPendingRetry: (pendingRequest, pendingError) => set({ pendingRequest, pendingError }),
      setLastRequest: (lastRequest) => set({ lastRequest }),
      setNotice: (notice) => set({ notice }),
      reopenAtCurrent: (version) => set({
        baseVersion: version,
        baseVersionAt: new Date().toISOString(),
        conflict: null,
        pendingRequest: null,
        pendingError: null
      })
    }),
    {
      name: 'yy60-carbon-session',
      // 冲突/待重试请求等只存在于当前页会话，不做本地持久化
      partialize: (state) => ({ actor: state.actor, signDraft: state.signDraft, manualChecks: state.manualChecks })
    }
  )
);
