'use client';

import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Card,
  CardContent,
  Chip,
  Divider,
  Stack,
  Typography
} from '@mui/material';
import {
  ExpandMoreOutlined,
  FactCheckOutlined,
  HistoryOutlined
} from '@mui/icons-material';
import type { WorkbookResponse } from '@/lib/schema';

const kindColor: Record<string, 'success' | 'warning' | 'info' | 'secondary'> = {
  sign: 'success',
  evidence: 'warning',
  factor: 'info',
  sample: 'secondary'
};
const kindLabel: Record<string, string> = {
  sign: '签字',
  evidence: '现场补证',
  factor: '因子更新',
  sample: '抽样范围'
};

function shortTime(iso: string) {
  return new Date(iso).toLocaleTimeString('zh-CN', { hour12: false });
}

export default function VersionAuditCard({ workbook }: { workbook: WorkbookResponse }) {
  return (
    <Card elevation={0} variant="outlined">
      <Accordion disableGutters elevation={0} sx={{ bgcolor: 'transparent', '&:before': { display: 'none' } }}>
        <AccordionSummary expandIcon={<ExpandMoreOutlined />} sx={{ px: 2, minHeight: 48 }}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <HistoryOutlined fontSize="small" />
            <Typography fontWeight={800} fontSize={14}>版本时间线与审计链</Typography>
            <Chip size="small" label={`V${workbook.version}`} color="success" />
            <Chip size="small" label={`${workbook.audit.length} 条审计`} variant="outlined" />
          </Stack>
        </AccordionSummary>
        <AccordionDetails sx={{ px: 2, pt: 0 }}>
          <Typography fontSize={11} fontWeight={800} color="text.secondary">版本</Typography>
          {workbook.versions.length === 0 && <Typography fontSize={11} color="text.secondary" py={0.8}>尚无更新（初始 V1）。</Typography>}
          {workbook.versions.map((entry) => (
            <Stack key={entry.version} direction="row" spacing={1} alignItems="flex-start" sx={{ borderTop: '1px solid #edf0ef', py: 0.9 }}>
              <Chip size="small" label={`V${entry.version}`} color={kindColor[entry.kind] ?? 'default'} sx={{ minWidth: 44 }} />
              <Box>
                <Typography fontSize={11.5}>{entry.detail}</Typography>
                <Typography fontSize={10} color="text.secondary">{entry.actor} · {shortTime(entry.at)}</Typography>
              </Box>
            </Stack>
          ))}

          <Divider sx={{ my: 1.2 }} />
          <Stack direction="row" alignItems="center" spacing={1} mb={0.5}>
            <FactCheckOutlined fontSize="small" color="action" />
            <Typography fontSize={11} fontWeight={800} color="text.secondary">审计链（按请求编号去重）</Typography>
          </Stack>
          {workbook.audit.length === 0 && <Typography fontSize={11} color="text.secondary" py={0.8}>尚无核验记录。</Typography>}
          {workbook.audit.map((entry) => (
            <Box key={entry.id} sx={{ borderTop: '1px solid #edf0ef', py: 0.9 }}>
              <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
                <Chip size="small" label={kindLabel[entry.kind] ?? entry.kind} color={kindColor[entry.kind] ?? 'default'} variant={entry.replayed ? 'outlined' : 'filled'} sx={{ height: 20, fontSize: 10 }} />
                <Typography fontSize={10.5} color="text.secondary" sx={{ fontFamily: 'monospace' }}>{entry.requestId}</Typography>
                {entry.replayed && <Chip size="small" label="回放" variant="outlined" sx={{ height: 18, fontSize: 9 }} />}
              </Stack>
              <Typography fontSize={11.5} mt={0.4}>{entry.detail}</Typography>
              <Typography fontSize={10} color="text.secondary">{entry.actor} · V{entry.version} · {shortTime(entry.at)}</Typography>
            </Box>
          ))}
        </AccordionDetails>
      </Accordion>
    </Card>
  );
}
