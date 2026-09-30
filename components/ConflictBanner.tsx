'use client';

import { Alert, Box, Button, Chip, Divider, Stack, Typography } from '@mui/material';
import GppMaybeOutlinedIcon from '@mui/icons-material/GppMaybeOutlined';
import type { ConflictResponse } from '@/lib/schema';

const kindLabel: Record<string, string> = {
  evidence: '现场补证',
  factor: '排放因子更新',
  sample: '抽样范围调整',
  sign: '签字'
};

export default function ConflictBanner({
  conflict,
  onReopen
}: {
  conflict: ConflictResponse;
  onReopen: (currentVersion: number) => void;
}) {
  const sources = conflict.invalidatedSignatures.flatMap((signature) =>
    signature.invalidationSources.map((source) => ({ signatureId: signature.id, ...source }))
  );

  return (
    <Alert
      severity="warning"
      icon={<GppMaybeOutlinedIcon />}
      sx={{ alignItems: 'flex-start' }}
      action={
        <Button
          color="inherit"
          size="small"
          sx={{ fontWeight: 800, whiteSpace: 'nowrap' }}
          onClick={() => onReopen(conflict.currentVersion)}
        >
          以 V{conflict.currentVersion} 重新打开
        </Button>
      }
    >
      <Typography fontSize={12.5} fontWeight={800}>
        版本冲突：本页打开时为 V{conflict.baseVersion}，当前已是 V{conflict.currentVersion}
      </Typography>
      <Typography fontSize={11.5} mt={0.3}>
        本次提交未被接纳。您填写的意见与抽样勾选已原样保留，请先查看下方冲突与失效来源，再基于当前版本继续。
      </Typography>

      {conflict.changes.length > 0 && (
        <Box mt={1}>
          <Typography fontSize={11} fontWeight={800}>冲突期间的更新：</Typography>
          <Stack spacing={0.6} mt={0.5}>
            {conflict.changes.map((change) => (
              <Stack key={change.version} direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip size="small" label={`V${change.version}`} color="warning" variant="outlined" sx={{ height: 20, fontSize: 10 }} />
                <Chip size="small" label={kindLabel[change.kind] ?? change.kind} sx={{ height: 20, fontSize: 10 }} />
                <Typography fontSize={11}>{change.detail}</Typography>
                <Typography fontSize={10} color="text.secondary">— {change.actor}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}

      {sources.length > 0 && (
        <Box mt={1}>
          <Divider sx={{ mb: 0.6 }} />
          <Typography fontSize={11} fontWeight={800}>失效来源（旧签字仍可查，已另生成待复核副本）：</Typography>
          <Stack spacing={0.6} mt={0.5}>
            {sources.map((source, index) => (
              <Stack key={`${source.signatureId}-${index}`} direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip size="small" label={source.signatureId} variant="outlined" sx={{ height: 20, fontSize: 10 }} />
                <Chip size="small" label={kindLabel[source.kind] ?? source.kind} color="error" sx={{ height: 20, fontSize: 10 }} />
                <Typography fontSize={11}>{source.detail}</Typography>
                <Typography fontSize={10} color="text.secondary">{`V${source.fromVersion} → V${source.toVersion}`}</Typography>
              </Stack>
            ))}
          </Stack>
        </Box>
      )}
    </Alert>
  );
}
