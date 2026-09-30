'use client';

import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  TextField,
  Tooltip,
  Typography
} from '@mui/material';
import {
  HistoryOutlined,
  RuleOutlined,
  TaskAltOutlined,
  VerifiedOutlined
} from '@mui/icons-material';
import type { WorkbookResponse } from '@/lib/schema';
import { useCarbonStore } from '@/lib/store';
import { useWorkbookActions } from '@/lib/useWorkbook';

function formatTime(iso: string) {
  const date = new Date(iso);
  return `${date.toLocaleDateString('zh-CN')} ${date.toLocaleTimeString('zh-CN', { hour12: false })}`;
}

export default function SignPanel({ workbook }: { workbook: WorkbookResponse }) {
  const store = useCarbonStore();
  const { submit, submitting } = useWorkbookActions();
  const baseVersion = store.baseVersion;
  const stale = baseVersion !== null && baseVersion !== workbook.version;

  const activeSignatures = workbook.signatures.filter((signature) => signature.status === 'active');
  const invalidatedSignatures = workbook.signatures.filter((signature) => signature.status === 'invalidated');
  const pendingCopies = workbook.reviewCopies.filter((copy) => copy.status === '待复核');

  return (
    <Stack spacing={1.5}>
      <Card elevation={0} variant="outlined">
        <CardContent>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Typography fontWeight={800} fontSize={14}>核验员签字</Typography>
            <Chip
              size="small"
              color={stale ? 'warning' : 'success'}
              variant={stale ? 'outlined' : 'filled'}
              label={baseVersion === null ? '尚未打开签字页' : stale ? `基线 V${baseVersion}（已落后 V${workbook.version}）` : `基线 V${baseVersion}（最新）`}
            />
          </Stack>
          <Typography fontSize={10.5} color="text.secondary" mt={0.8}>
            签字瞬间冻结三类数据：抽样范围、每条抽样记录的证据份数、排放因子版本。之后任一项更新，本签字自动失效并生成待复核副本。
          </Typography>
          <TextField
            fullWidth
            size="small"
            label="核验意见（冲突后仍保留）"
            multiline
            rows={2}
            value={store.signDraft}
            onChange={(event) => store.setSignDraft(event.target.value)}
            margin="normal"
            sx={{ '& .MuiInputBase-input': { fontSize: 12.5 } }}
          />
          <Stack direction="row" spacing={1} mt={0.5}>
            <Tooltip title={baseVersion === null ? '请先打开核验页面获取基线版本' : stale ? '本页基线已落后，请先处理冲突' : ''}>
              <span>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<VerifiedOutlined />}
                  disabled={submitting || baseVersion === null || stale}
                  onClick={() => void submit({
                    kind: 'sign',
                    baseVersion: baseVersion ?? workbook.version,
                    payload: { signer: store.actor, comment: store.signDraft },
                    successText: '签字完成：抽样范围、证据份数与因子版本已冻结。'
                  })}
                >
                  {submitting ? '提交中…' : '签字冻结版本'}
                </Button>
              </span>
            </Tooltip>
          </Stack>
          {activeSignatures.length > 0 && (
            <Alert severity="success" icon={<TaskAltOutlined fontSize="small" />} sx={{ mt: 1.2, py: 0.3 }}>
              <Typography fontSize={11}>
                当前有效签字 {activeSignatures.length} 份，签发检查绿灯以此为准。
              </Typography>
            </Alert>
          )}
        </CardContent>
      </Card>

      {pendingCopies.length > 0 && (
        <Card elevation={0} variant="outlined" sx={{ borderColor: '#e0a64b' }}>
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1} mb={1}>
              <RuleOutlined color="warning" fontSize="small" />
              <Typography fontWeight={800} fontSize={14}>待复核副本</Typography>
              <Chip size="small" color="warning" label={pendingCopies.length} />
            </Stack>
            {pendingCopies.map((copy) => (
              <Box key={copy.id} sx={{ borderTop: '1px solid #edf0ef', py: 1.1 }}>
                <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                  <Chip size="small" label={copy.id} variant="outlined" />
                  <Typography fontSize={11.5} fontWeight={700}>{copy.signer} 的原签字 {copy.signatureId}</Typography>
                  <Typography fontSize={10} color="text.secondary">基于 V{copy.fromVersion}，当前 V{workbook.version}</Typography>
                </Stack>
                <Typography fontSize={11} color="text.secondary" mt={0.6}>保留的填写意见：{copy.comment || '（无）'}</Typography>
                <Box mt={0.6}>
                  {copy.sources.map((source, index) => (
                    <Typography key={index} fontSize={10.5} sx={{ color: '#9a5a1c' }}>
                      · 失效来源：{source.detail}
                    </Typography>
                  ))}
                </Box>
                <Tooltip title={stale ? '本页基线已落后，请先以当前版本重新打开' : '沿用副本中的填写意见，对当前版本重新冻结并签字'}>
                  <span>
                    <Button
                      size="small"
                      variant="contained"
                      color="warning"
                      sx={{ mt: 0.8 }}
                      disabled={submitting || baseVersion === null || stale}
                      onClick={() => void submit({
                        kind: 'resign',
                        baseVersion: baseVersion ?? workbook.version,
                        payload: { copyId: copy.id, signer: store.actor, comment: copy.comment },
                        successText: '已基于待复核副本重新签字；原签字仍可查。'
                      })}
                    >
                      复核并重新签字
                    </Button>
                  </span>
                </Tooltip>
              </Box>
            ))}
          </CardContent>
        </Card>
      )}

      <Card elevation={0} variant="outlined">
        <CardContent>
          <Stack direction="row" alignItems="center" spacing={1} mb={1}>
            <HistoryOutlined fontSize="small" color="action" />
            <Typography fontWeight={800} fontSize={14}>签字档案（原签字仍可查）</Typography>
          </Stack>
          {workbook.signatures.length === 0 && (
            <Typography fontSize={11.5} color="text.secondary">尚无签字记录。</Typography>
          )}
          {workbook.signatures.map((signature) => (
            <Box key={signature.id} sx={{ borderTop: '1px solid #edf0ef', py: 1.1 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip
                  size="small"
                  label={signature.status === 'active' ? '有效' : '已失效'}
                  color={signature.status === 'active' ? 'success' : 'default'}
                  variant={signature.status === 'active' ? 'filled' : 'outlined'}
                />
                <Typography fontSize={11.5} fontWeight={700}>{signature.signer} · {signature.id}</Typography>
                <Typography fontSize={10} color="text.secondary">冻结于 V{signature.baseVersion} · {formatTime(signature.signedAt)}</Typography>
              </Stack>
              {signature.comment && <Typography fontSize={11} mt={0.5}>{signature.comment}</Typography>}
              <Typography fontSize={10.5} color="text.secondary" mt={0.4}>
                冻结抽样 {signature.frozenSampleIds.length} 项；
                {signature.frozen.map((entry) => `${entry.recordId.split('-')[1]}=${entry.evidenceCount}份/${entry.factorVersion}`).join('，')}
              </Typography>
              {signature.status === 'invalidated' && (
                <Box mt={0.5}>
                  {signature.invalidationSources.map((source, index) => (
                    <Typography key={index} fontSize={10.5} color="secondary.main">
                      · {source.detail}
                    </Typography>
                  ))}
                </Box>
              )}
            </Box>
          ))}
          <Divider sx={{ my: 1 }} />
          <Typography fontSize={11} color="text.secondary">请求编号留痕（首条签字）：{workbook.signatures[0]?.requestId ?? '—'}</Typography>
        </CardContent>
      </Card>
    </Stack>
  );
}
