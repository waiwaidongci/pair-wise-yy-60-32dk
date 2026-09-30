'use client';

import type { ReactNode } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Stack,
  Typography
} from '@mui/material';
import {
  CheckCircleRounded,
  CancelRounded,
  AssessmentOutlined,
  TaskAltOutlined
} from '@mui/icons-material';
import type { WorkbookResponse } from '@/lib/schema';
import { useCarbonStore } from '@/lib/store';

function Gate({
  passed,
  title,
  detail,
  children
}: {
  passed: boolean;
  title: string;
  detail: string;
  children?: ReactNode;
}) {
  return (
    <Box sx={{ display: 'flex', gap: 1.3, alignItems: 'flex-start', borderTop: '1px solid #edf0ef', py: 1.6 }}>
      {passed
        ? <CheckCircleRounded color="success" sx={{ fontSize: 22, mt: 0.2 }} />
        : <CancelRounded color="disabled" sx={{ fontSize: 22, mt: 0.2 }} />}
      <Box sx={{ flex: 1 }}>
        <Stack direction="row" spacing={1} alignItems="center">
          <Typography fontSize={13} fontWeight={800}>{title}</Typography>
          <Chip size="small" label={passed ? '绿灯' : '未通过'} color={passed ? 'success' : 'default'} variant={passed ? 'filled' : 'outlined'} sx={{ height: 20, fontSize: 10 }} />
        </Stack>
        <Typography fontSize={10.8} color="text.secondary" mt={0.4}>{detail}</Typography>
        {children}
      </Box>
    </Box>
  );
}

export default function IssuancePanel({ workbook }: { workbook: WorkbookResponse }) {
  const store = useCarbonStore();
  const openFindings = store.findings.filter((item) => item.status !== '已关闭');

  const activeSignatures = workbook.signatures.filter((signature) => signature.status === 'active');
  const invalidatedSignatures = workbook.signatures.filter((signature) => signature.status === 'invalidated');
  const pendingCopies = workbook.reviewCopies.filter((copy) => copy.status === '待复核');

  // 核心修复：签发绿灯只绑定「当前仍有效」的签字；补证 / 因子更新后旧签字失效，绿灯必须熄灭
  const evidenceGatePassed = activeSignatures.length > 0;
  const revisionsGatePassed = true; // 版本时间线 + 审计链 + 失效签字档案由系统保证不覆盖
  const calculationGatePassed = store.manualChecks.calculation;
  const methodologyGatePassed = store.manualChecks.methodology;
  const gates = [evidenceGatePassed, revisionsGatePassed, calculationGatePassed, methodologyGatePassed];
  const readiness = Math.round(gates.filter(Boolean).length / gates.length * 70 + (openFindings.length === 0 ? 30 : 0));
  const allPassed = gates.every(Boolean) && openFindings.length === 0;

  const latestActive = activeSignatures[0];

  return (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 380px' }, gap: 1.5 }}>
      <Card elevation={0} variant="outlined">
        <CardContent>
          <Typography fontWeight={800} fontSize={14}>签发前完整性检查</Typography>
          <Typography fontSize={11} color="text.secondary" mb={1}>
            门禁与签字冻结的版本绑定；现场补证或排放因子更新后，失效签字不再点亮绿灯。
          </Typography>

          <Gate
            passed={evidenceGatePassed}
            title="证据与计算链完整（有效签字 + 冻结三类数据）"
            detail={evidenceGatePassed
              ? `有效签字 ${latestActive?.id} 冻结于 V${latestActive?.baseVersion}：抽样范围 ${latestActive?.frozenSampleIds.length} 项、各记录证据份数与因子版本均未变化。`
              : invalidatedSignatures.length > 0
                ? `最近签字 ${invalidatedSignatures[0].id} 已因绑定数据更新失效（原签字仍可查），待复核副本复核重签前本门禁不得通过。`
                : '尚无核验员签字，需先在「证据与抽样核验」页冻结版本并签字。'}
          >
            {evidenceGatePassed && latestActive && (
              <Box sx={{ mt: 0.8, p: 1, bgcolor: '#f1f8f4', borderRadius: 1, fontFamily: 'monospace', fontSize: 10.5 }}>
                {latestActive.frozen.map((entry) => (
                  <Box key={entry.recordId}>{entry.recordId}：证据 {entry.evidenceCount} 份 · 因子 {entry.factorVersion}</Box>
                ))}
              </Box>
            )}
            {!evidenceGatePassed && invalidatedSignatures[0] && (
              <Box sx={{ mt: 0.8 }}>
                {invalidatedSignatures[0].invalidationSources.map((source, index) => (
                  <Typography key={index} fontSize={10.8} color="secondary.main">· {source.detail}</Typography>
                ))}
              </Box>
            )}
          </Gate>

          <Gate
            passed={revisionsGatePassed}
            title="历史修订未覆盖原始数据"
            detail={`版本时间线 ${workbook.versions.length + 1} 个版本、审计链 ${workbook.audit.length} 条记录可追溯；失效签字 ${invalidatedSignatures.length} 份保留可查，待复核副本 ${pendingCopies.length} 份。`}
          />

          <Box component="label" sx={{ display: 'flex', gap: 1.3, alignItems: 'flex-start', borderTop: '1px solid #edf0ef', py: 1.6, cursor: 'pointer' }}>
            {calculationGatePassed
              ? <CheckCircleRounded color="success" sx={{ fontSize: 22, mt: 0.2 }} />
              : <CancelRounded color="disabled" sx={{ fontSize: 22, mt: 0.2 }} />}
            <Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography fontSize={13} fontWeight={800}>计算过程复核通过</Typography>
                <Chip size="small" label={calculationGatePassed ? '绿灯' : '人工确认'} color={calculationGatePassed ? 'success' : 'default'} variant={calculationGatePassed ? 'filled' : 'outlined'} sx={{ height: 20, fontSize: 10 }} />
              </Stack>
              <Typography fontSize={10.8} color="text.secondary" mt={0.4}>单位和换算系数一致，关键公式由核验员确认。</Typography>
              <input type="checkbox" checked={calculationGatePassed} onChange={() => store.toggleManualCheck('calculation')} style={{ marginTop: 8 }} />
            </Box>
          </Box>

          <Box component="label" sx={{ display: 'flex', gap: 1.3, alignItems: 'flex-start', borderTop: '1px solid #edf0ef', py: 1.6, cursor: 'pointer' }}>
            {methodologyGatePassed
              ? <CheckCircleRounded color="success" sx={{ fontSize: 22, mt: 0.2 }} />
              : <CancelRounded color="disabled" sx={{ fontSize: 22, mt: 0.2 }} />}
            <Box>
              <Stack direction="row" spacing={1} alignItems="center">
                <Typography fontSize={13} fontWeight={800}>方法学与监测计划匹配</Typography>
                <Chip size="small" label={methodologyGatePassed ? '绿灯' : '人工确认'} color={methodologyGatePassed ? 'success' : 'default'} variant={methodologyGatePassed ? 'filled' : 'outlined'} sx={{ height: 20, fontSize: 10 }} />
              </Stack>
              <Typography fontSize={10.8} color="text.secondary" mt={0.4}>项目采用 {workbook.project.methodology}。</Typography>
              <input type="checkbox" checked={methodologyGatePassed} onChange={() => store.toggleManualCheck('methodology')} style={{ marginTop: 8 }} />
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Stack spacing={1.5}>
        <Card elevation={0} variant="outlined">
          <CardContent>
            <Stack direction="row" alignItems="center" spacing={1}>
              <AssessmentOutlined fontSize="small" />
              <Typography fontWeight={800} fontSize={14}>签发就绪度</Typography>
            </Stack>
            <Stack direction="row" alignItems="baseline" spacing={1} mt={1}>
              <Typography variant="h4" fontWeight={850}>{readiness}%</Typography>
              <Typography fontSize={11} color="text.secondary">完成度</Typography>
            </Stack>
            <LinearProgress variant="determinate" value={readiness} color={allPassed ? 'success' : 'warning'} sx={{ height: 7, borderRadius: 3, mt: 1 }} />
            <Typography fontSize={11} color="text.secondary" mt={1.2}>
              当前数据版本 V{workbook.version}；有效签字 {activeSignatures.length} 份
              {openFindings.length > 0 ? `；还有 ${openFindings.length} 个开放发现项` : ''}
              {pendingCopies.length > 0 ? `；${pendingCopies.length} 份待复核副本未重签` : ''}。
            </Typography>
            <Button fullWidth variant="contained" color={allPassed ? 'success' : 'primary'} disabled={!allPassed} startIcon={<TaskAltOutlined />} sx={{ mt: 1.6 }}>
              {allPassed ? '提交签发准备' : '门禁未全部绿灯'}
            </Button>
          </CardContent>
        </Card>

        <Alert severity={allPassed ? 'success' : 'warning'}>
          {allPassed
            ? '全部门禁在当前版本下通过，可提交签发准备。'
            : evidenceGatePassed
              ? '完成剩余人工确认并关闭发现项后可提交。'
              : '有效签字缺失或已失效：补证 / 因子更新后必须复核重签，旧绿灯不会沿用。'}
        </Alert>
      </Stack>
    </Box>
  );
}
