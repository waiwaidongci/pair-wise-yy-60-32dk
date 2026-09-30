'use client';

import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Chip,
  FormControlLabel,
  Stack,
  TextField,
  Typography
} from '@mui/material';
import type { WorkbookRecord, WorkbookResponse } from '@/lib/schema';
import { useCarbonStore } from '@/lib/store';
import { useWorkbookActions } from '@/lib/useWorkbook';

export type UpdateMode = 'evidence' | 'factor' | 'sample';

const modeTitle: Record<UpdateMode, string> = {
  evidence: '现场补证',
  factor: '排放因子更新',
  sample: '调整抽样范围'
};

const modeHint: Record<UpdateMode, string> = {
  evidence: '证据份数变化后，绑定旧版本的签字将立即失效并生成待复核副本；签发绿灯随之熄灭。',
  factor: '新因子版本将与签字冻结快照比对；因子版本不一致即构成失效来源。',
  sample: '抽样范围的新增/移除都会使旧签字失效，需要复核员重新签字。'
};

export default function UpdateDialog({
  open,
  mode,
  record,
  workbook,
  onClose
}: {
  open: boolean;
  mode: UpdateMode;
  record: WorkbookRecord | null;
  workbook: WorkbookResponse;
  onClose: () => void;
}) {
  const store = useCarbonStore();
  const { submit, submitting } = useWorkbookActions();
  const [addCount, setAddCount] = useState('1');
  const [factorValue, setFactorValue] = useState('');
  const [factorVersion, setFactorVersion] = useState('');
  const [reason, setReason] = useState('');
  const [draftSample, setDraftSample] = useState<string[]>([]);

  const baseVersion = store.baseVersion;
  const stale = baseVersion !== null && baseVersion !== workbook.version;

  const effectiveSample = useMemo(
    () => (draftSample.length ? draftSample : workbook.sampledIds),
    [draftSample, workbook.sampledIds]
  );

  if (!open) {
    return null;
  }

  const close = () => {
    setAddCount('1');
    setFactorValue('');
    setFactorVersion('');
    setReason('');
    setDraftSample([]);
    onClose();
  };

  const submitBase = () => ({
    reason: reason.trim() || undefined
  });

  const doSubmit = async () => {
    if (baseVersion === null) {
      return;
    }
    let result: Awaited<ReturnType<typeof submit>> = null;
    if (mode === 'evidence' && record) {
      const add = Number(addCount);
      if (!Number.isFinite(add) || add <= 0) {
        return;
      }
      result = await submit({
        kind: 'evidence',
        baseVersion,
        payload: { ...submitBase(), recordId: record.id, addCount: add },
        successText: '现场补证已写入；受影响签字已失效，已生成待复核副本。'
      });
    } else if (mode === 'factor' && record) {
      const value = Number(factorValue);
      if (!Number.isFinite(value) || value <= 0 || !factorVersion.trim()) {
        return;
      }
      result = await submit({
        kind: 'factor',
        baseVersion,
        payload: { ...submitBase(), recordId: record.id, factor: value, factorVersion: factorVersion.trim() },
        successText: '因子版本已更新；冻结旧因子的签字已失效并进入待复核。'
      });
    } else if (mode === 'sample') {
      result = await submit({
        kind: 'sample',
        baseVersion,
        payload: { ...submitBase(), sampledIds: draftSample.length ? draftSample : workbook.sampledIds },
        keepDraft: 'sample',
        successText: '抽样范围已更新；旧签字失效并生成待复核副本。'
      });
    }
    // 仅在被接纳时关闭；冲突/失败保持对话框打开，填写内容不丢
    if (result) {
      close();
    }
  };

  const factorValid = mode !== 'factor' || (Number(factorValue) > 0 && factorVersion.trim().length > 0);
  const evidenceValid = mode !== 'evidence' || Number(addCount) > 0;

  return (
    <Box sx={{ position: 'fixed', inset: 0, zIndex: 60, bgcolor: 'rgba(15,25,22,.4)', display: 'grid', placeItems: 'center', p: 2 }} onMouseDown={close}>
      <Card sx={{ width: 'min(560px, 100%)' }} onMouseDown={(event) => event.stopPropagation()}>
        <CardContent sx={{ p: 2.2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography variant="h6" fontWeight={800} fontSize={16}>{modeTitle[mode]}</Typography>
            <Chip size="small" label={baseVersion === null ? '无基线' : stale ? `基线 V${baseVersion} 已落后（V${workbook.version}）` : `提交将基于 V${baseVersion}`} color={stale ? 'warning' : 'default'} variant="outlined" />
          </Stack>
          <Typography variant="body2" color="text.secondary" mt={0.7} fontSize={12}>{modeHint[mode]}</Typography>

          {stale && (
            <Alert severity="warning" sx={{ mt: 1.2 }}>
              本页基线已落后。若仍提交，将只返回冲突而不会写入；可在页面顶部以当前版本重新打开（填写内容保留）。
            </Alert>
          )}

          {(mode === 'evidence' || mode === 'factor') && record && (
            <Box mt={1.3} p={1.3} sx={{ bgcolor: '#f4f7f5', borderRadius: 1 }}>
              <Typography fontSize={12} fontWeight={700}>{record.source}</Typography>
              <Typography fontSize={11} color="text.secondary">
                {record.id} · 当前证据 {record.evidenceCount} 份 · 当前因子 {record.factor}（{record.factorVersion}）
              </Typography>
            </Box>
          )}

          {mode === 'evidence' && (
            <TextField fullWidth size="small" label="补充证据份数" type="number" value={addCount} onChange={(event) => setAddCount(event.target.value)} margin="normal" />
          )}
          {mode === 'factor' && (
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.2} mt={1.5}>
              <TextField size="small" label={`新因子值 / ${record?.factorUnit ?? ''}`} type="number" value={factorValue} onChange={(event) => setFactorValue(event.target.value)} sx={{ flex: 1 }} />
              <TextField size="small" label="新因子版本号（如 EF-CNGRID-2025）" value={factorVersion} onChange={(event) => setFactorVersion(event.target.value)} sx={{ flex: 1.3 }} />
            </Stack>
          )}
          {mode === 'sample' && (
            <Box mt={1.5}>
              {workbook.records.map((item) => (
                <FormControlLabel
                  key={item.id}
                  sx={{ display: 'flex' }}
                  control={
                    <Checkbox
                      size="small"
                      checked={effectiveSample.includes(item.id)}
                      onChange={(event) => {
                        setDraftSample((prev) => {
                          const base = prev.length ? prev : workbook.sampledIds;
                          return event.target.checked ? [...base, item.id] : base.filter((id) => id !== item.id);
                        });
                      }}
                    />
                  }
                  label={
                    <Box>
                      <Typography fontSize={12} fontWeight={700}>{item.id} · {item.source}</Typography>
                      <Typography fontSize={10} color="text.secondary">证据 {item.evidenceCount} 份 · 因子 {item.factorVersion}</Typography>
                    </Box>
                  }
                />
              ))}
            </Box>
          )}

          <TextField fullWidth size="small" label="更新原因 / 说明" multiline rows={2} value={reason} onChange={(event) => setReason(event.target.value)} margin="normal" />

          <Stack direction="row" spacing={1} justifyContent="flex-end" mt={1.5}>
            <Button onClick={close}>取消</Button>
            <Button
              variant="contained"
              disabled={submitting || baseVersion === null || stale || !factorValid || !evidenceValid}
              onClick={() => void doSubmit()}
            >
              {submitting ? '提交中…' : '提交更新'}
            </Button>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}
