'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Alert,
  AppBar,
  Avatar,
  Badge,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Divider,
  Drawer,
  FormControlLabel,
  IconButton,
  LinearProgress,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  Stack,
  Switch,
  Tab,
  Tabs,
  TextField,
  Toolbar,
  Tooltip,
  Typography
} from '@mui/material';
import {
  AccountTreeOutlined,
  AssessmentOutlined,
  AssignmentTurnedInOutlined,
  CheckCircleOutlined,
  CloudUploadOutlined,
  DashboardOutlined,
  DrawOutlined,
  FactCheckOutlined,
  FindInPageOutlined,
  HistoryEduOutlined,
  MenuOutlined,
  MoreHorizOutlined,
  NotificationsNoneOutlined,
  RuleOutlined,
  ScienceOutlined,
  TaskAltOutlined
} from '@mui/icons-material';
import { fetchEvidence, fetchSignOffs, registerDataChange, submitSignOff } from '@/lib/api';
import { buildSnapshot, snapshotDiff, snapshotSummary, type ChangeSource, type SignOff, type SignOffSnapshot } from '@/lib/signoff';
import { useCarbonStore, type CarbonRecord } from '@/lib/store';

const drawerWidth = 232;

type View = 'overview' | 'verify' | 'issuance';

export default function EvidenceWorkbench({ initialView }: { initialView: View }) {
  const [view] = useState<View>(initialView);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [recordFilter, setRecordFilter] = useState('全部');
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [correctionValue, setCorrectionValue] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['carbon-api'], queryFn: fetchEvidence });
  const signoffsQuery = useQuery({ queryKey: ['signoffs'], queryFn: fetchSignOffs });
  const signMutation = useMutation({ mutationFn: submitSignOff });
  const changeMutation = useMutation({ mutationFn: registerDataChange });
  const store = useCarbonStore();
  const selected = store.records.find((record) => record.id === store.selectedRecordId) ?? store.records[0];
  const visibleRecords = useMemo(() => recordFilter === '全部' ? store.records : store.records.filter((record) => record.status === recordFilter), [recordFilter, store.records]);
  const totalReduction = store.records.reduce((total, record) => total + record.activity * record.factor / (record.unit === 'kWh' ? 1000 : record.unit === 'L' ? 1000 : 1), 0);
  const openFindings = store.findings.filter((item) => item.status !== '已关闭');
  const currentSnapshot = useMemo(() => buildSnapshot(store.records, store.sampledIds), [store.records, store.sampledIds]);
  const dataVersion = signoffsQuery.data?.dataVersion ?? 0;
  const validSignOff = signoffsQuery.data?.signOffs.find((item) => item.status === '有效' && item.baseVersion === dataVersion);
  const allIssuanceChecked = Object.values(store.issuanceChecks).every(Boolean) && openFindings.length === 0 && Boolean(validSignOff);

  type SignSubmitPayload = {
    requestId: string;
    actor: string;
    note: string;
    baseVersion: number;
    snapshot: SignOffSnapshot;
    supersedesId?: string;
    failOnce?: boolean;
  };

  const [baseVersion, setBaseVersion] = useState<number | null>(null);
  const [signNote, setSignNote] = useState('');
  const [signActor, setSignActor] = useState('沈楠');
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [conflict, setConflict] = useState<{ baseVersion: number; currentVersion: number; sources: ChangeSource[]; draft: SignOff } | null>(null);
  const [failedRequest, setFailedRequest] = useState<{ requestId: string; payload: SignSubmitPayload } | null>(null);
  const [factorOpen, setFactorOpen] = useState(false);
  const [factorTarget, setFactorTarget] = useState<CarbonRecord | null>(null);
  const [factorValue, setFactorValue] = useState('');
  const signRequestRef = useRef<string | null>(null);

  useEffect(() => {
    if (signoffsQuery.data && baseVersion === null) {
      setBaseVersion(signoffsQuery.data.dataVersion);
    }
  }, [signoffsQuery.data, baseVersion]);

  const resetSignRequest = () => {
    signRequestRef.current = null;
    setFailedRequest(null);
    setSimulateFailure(false);
  };

  const handleSign = async (supersedesId?: string) => {
    if (baseVersion == null) return;
    const requestId = signRequestRef.current ?? `REQ-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    signRequestRef.current = requestId;
    const payload: SignSubmitPayload = {
      requestId,
      actor: signActor,
      note: signNote.trim(),
      baseVersion,
      snapshot: currentSnapshot,
      supersedesId,
      failOnce: simulateFailure
    };
    try {
      const result = await signMutation.mutateAsync(payload);
      if (result.kind === 'conflict') {
        setConflict({ baseVersion: result.baseVersion, currentVersion: result.currentVersion, sources: result.sources, draft: result.draft });
        setFailedRequest(null);
      } else {
        setConflict(null);
        resetSignRequest();
        setSignNote('');
        setBaseVersion(dataVersion);
        void signoffsQuery.refetch();
      }
    } catch {
      setFailedRequest({ requestId, payload });
      setSimulateFailure(false);
    }
  };

  const handleRetry = async () => {
    if (!failedRequest) return;
    try {
      const result = await signMutation.mutateAsync({ ...failedRequest.payload, failOnce: false });
      if (result.kind === 'conflict') {
        setConflict({ baseVersion: result.baseVersion, currentVersion: result.currentVersion, sources: result.sources, draft: result.draft });
        setFailedRequest(null);
      } else {
        setConflict(null);
        resetSignRequest();
        setSignNote('');
        setBaseVersion(dataVersion);
        void signoffsQuery.refetch();
      }
    } catch {
      /* 保留失败状态，等待再次重试 */
    }
  };

  const handleConfirmDraft = async (draft: SignOff) => {
    if (!signoffsQuery.data) return;
    const requestId = `REQ-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    const payload: SignSubmitPayload = {
      requestId,
      actor: draft.actor,
      note: draft.note,
      baseVersion: signoffsQuery.data.dataVersion,
      snapshot: currentSnapshot,
      supersedesId: draft.id
    };
    try {
      const result = await signMutation.mutateAsync(payload);
      if (result.kind === 'conflict') {
        setConflict({ baseVersion: result.baseVersion, currentVersion: result.currentVersion, sources: result.sources, draft: result.draft });
      } else {
        setConflict(null);
        setBaseVersion(signoffsQuery.data.dataVersion);
        void signoffsQuery.refetch();
      }
    } catch {
      setFailedRequest({ requestId, payload });
    }
  };

  const handleChange = async (sources: ChangeSource[], nextSnapshot: SignOffSnapshot) => {
    const requestId = `CHG-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
    try {
      await changeMutation.mutateAsync({ requestId, sources, snapshot: nextSnapshot });
      void signoffsQuery.refetch();
    } catch {
      /* 变更失败时保留本地状态，可稍后重试 */
    }
  };

  const handleToggleSample = (id: string) => {
    const prev = buildSnapshot(store.records, store.sampledIds);
    const nextIds = store.sampledIds.includes(id) ? store.sampledIds.filter((item) => item !== id) : [...store.sampledIds, id];
    store.toggleSample(id);
    const next = buildSnapshot(store.records, nextIds);
    void handleChange(snapshotDiff(prev, next), next);
  };

  const handleSupplement = (record: CarbonRecord) => {
    const prev = buildSnapshot(store.records, store.sampledIds);
    const nextRecords = store.records.map((item) => item.id === record.id ? { ...item, evidenceCount: item.evidenceCount + 1 } : item);
    store.supplementEvidence(record.id);
    const next = buildSnapshot(nextRecords, store.sampledIds);
    void handleChange(snapshotDiff(prev, next), next);
  };

  const openFactorDialog = (record: CarbonRecord) => {
    setFactorTarget(record);
    setFactorValue(String(record.factor));
    setFactorOpen(true);
  };

  const handleFactorUpdate = () => {
    if (!factorTarget) return;
    const factor = Number(factorValue);
    if (!Number.isFinite(factor)) return;
    const prev = buildSnapshot(store.records, store.sampledIds);
    const nextRecords = store.records.map((item) => item.id === factorTarget.id ? { ...item, factor, revision: item.revision + 1 } : item);
    store.updateFactor(factorTarget.id, factor);
    const next = buildSnapshot(nextRecords, store.sampledIds);
    void handleChange(snapshotDiff(prev, next), next);
    setFactorOpen(false);
    setFactorTarget(null);
  };

  const nav = [
    { id: 'overview', label: '监测期总览', href: '/', icon: DashboardOutlined },
    { id: 'verify', label: '证据与抽样核验', href: '/verify', icon: FindInPageOutlined },
    { id: 'issuance', label: '签发准备', href: '/issuance', icon: AssessmentOutlined }
  ];

  const navDrawer = (
    <Box sx={{ width: drawerWidth, bgcolor: '#f8faf9', height: '100%' }}>
      <Box sx={{ p: 2.2, pt: 3 }}>
        <Typography variant="overline" color="text.secondary">当前项目</Typography>
        <Typography fontWeight={800} fontSize={13} mt={.5}>{data?.project.name ?? '临港工业园区能效提升项目'}</Typography>
        <Typography variant="caption" color="text.secondary">{data?.project.id ?? 'CN-ER-2026-041'}</Typography>
      </Box>
      <Divider />
      <List sx={{ px: 1, py: 1.2 }}>
        {nav.map(({ id, label, href, icon: Icon }) => (
          <ListItemButton key={id} component={Link} href={href} selected={view === id} sx={{ borderRadius: 1, mb: .4, '&.Mui-selected': { bgcolor: '#e4f1ec', color: '#12664f' } }}>
            <ListItemIcon sx={{ minWidth: 36, color: 'inherit' }}><Icon fontSize="small" /></ListItemIcon>
            <ListItemText primary={label} primaryTypographyProps={{ fontSize: 13, fontWeight: view === id ? 750 : 500 }} />
          </ListItemButton>
        ))}
      </List>
      <Box sx={{ p: 2, mt: 2 }}>
        <Box sx={{ p: 1.3, border: '1px solid', borderColor: 'divider', borderRadius: 1, bgcolor: 'white' }}>
          <Stack direction="row" alignItems="center" spacing={1} mb={1}><ScienceOutlined color="primary" fontSize="small" /><Typography fontSize={12} fontWeight={750}>核验状态</Typography></Stack>
          <LinearProgress variant="determinate" value={78} sx={{ height: 5, borderRadius: 2 }} />
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>78% 证据已完成初审</Typography>
        </Box>
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh' }}>
      <AppBar position="fixed" elevation={0} sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, bgcolor: '#173a31', borderBottom: '1px solid rgba(255,255,255,.12)' }}>
        <Toolbar sx={{ minHeight: '62px !important', gap: 1.4 }}>
          <IconButton color="inherit" sx={{ display: { md: 'none' } }} onClick={() => setMobileOpen(true)}><MenuOutlined /></IconButton>
          <Box sx={{ width: 36, height: 36, borderRadius: 1, border: '1px solid #80b6a6', display: 'grid', placeItems: 'center' }}>
            <AccountTreeOutlined fontSize="small" />
          </Box>
          <Box>
            <Typography fontSize={15} fontWeight={800}>碳减排项目监测核验</Typography>
            <Typography fontSize={10} color="#a9c5bc">MRV Evidence & Issuance Readiness</Typography>
          </Box>
          <Box sx={{ flex: 1 }} />
          <Chip size="small" label={`${openFindings.length} 项发现开放`} sx={{ color: '#ffdda7', borderColor: '#a87935', bgcolor: 'rgba(255,255,255,.05)' }} variant="outlined" />
          <IconButton color="inherit"><NotificationsNoneOutlined /></IconButton>
          <Avatar sx={{ width: 30, height: 30, bgcolor: '#e1a45d', fontSize: 12 }}>沈</Avatar>
        </Toolbar>
      </AppBar>
      <Drawer variant="permanent" sx={{ width: drawerWidth, flexShrink: 0, display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { width: drawerWidth, pt: '62px', boxSizing: 'border-box', borderRightColor: '#dce4e0' } }}>{navDrawer}</Drawer>
      <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} ModalProps={{ keepMounted: true }} sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: drawerWidth, pt: '62px' } }}>{navDrawer}</Drawer>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, bgcolor: '#f2f5f3', pt: '62px' }}>
        <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 1640, mx: 'auto' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2} mb={2.4}>
            <Box>
              <Typography variant="overline" color="text.secondary" fontWeight={750}>CN-ER-2026-041 / {data?.summary.period ?? '第三监测期'}</Typography>
              <Typography variant="h5" fontWeight={850} mt={.3}>{view === 'overview' ? '监测期总览' : view === 'verify' ? '证据与抽样核验' : '签发准备'}</Typography>
              <Typography variant="body2" color="text.secondary" mt={.5}>{view === 'overview' ? '汇总活动数据、排放因子、证据完整度和异常波动。' : view === 'verify' ? '逐项核对来源、单位、时间范围，并保留修订链。' : '关闭发现项并完成签发前完整性门禁。'}</Typography>
            </Box>
            <Stack direction="row" spacing={1} alignItems="center">
              <Chip size="small" variant="outlined" icon={<HistoryEduOutlined />} label={`数据版本 V${dataVersion}`} />
              <Button variant="outlined" startIcon={<CloudUploadOutlined />}>导入监测数据</Button>
              <Button variant="contained" startIcon={<TaskAltOutlined />} disabled={view !== 'issuance' || !allIssuanceChecked}>提交签发准备</Button>
            </Stack>
          </Stack>
          {isLoading && <LinearProgress />}

          {view === 'overview' && (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 1.4, mb: 2 }}>
                {[
                  { label: '减排量', value: data?.summary.reduction.toLocaleString() ?? '18,426', unit: 'tCO₂e', note: '较上期 +6.4%' },
                  { label: '证据完整度', value: `${data?.summary.evidenceRate ?? 92}%`, unit: '', note: '5 份证据待补充' },
                  { label: '开放发现项', value: `${openFindings.length}`, unit: '项', note: '1 项阻塞签发' },
                  { label: '抽样任务', value: `${store.sampledIds.length} / 18`, unit: '', note: '完成率 67%' }
                ].map((item) => <Card elevation={0} variant="outlined" key={item.label}><CardContent sx={{ p: 1.8, '&:last-child': { pb: 1.8 } }}><Typography variant="caption" color="text.secondary">{item.label}</Typography><Stack direction="row" alignItems="baseline" spacing={.6} mt={.5}><Typography variant="h5" fontWeight={850}>{item.value}</Typography><Typography fontSize={12} color="text.secondary">{item.unit}</Typography></Stack><Typography fontSize={11} color="text.secondary" mt={.7}>{item.note}</Typography></CardContent></Card>)}
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.55fr) minmax(300px, .7fr)' }, gap: 1.5 }}>
                <Card elevation={0} variant="outlined">
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 1.6 }}>
                    <Box><Typography fontWeight={800} fontSize={14}>活动数据与计算链</Typography><Typography fontSize={11} color="text.secondary">选择记录查看公式、来源证据和修订版本</Typography></Box>
                    <Tabs value={recordFilter} onChange={(_, value) => setRecordFilter(value)} variant="scrollable"><Tab value="全部" label="全部" /><Tab value="待核验" label="待核验" /><Tab value="需补证" label="需补证" /><Tab value="已核验" label="已核验" /></Tabs>
                  </Stack>
                  <Divider />
                  <Box sx={{ overflowX: 'auto' }}>
                    <Box sx={{ minWidth: 840 }}>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1.7fr .9fr .8fr 1fr .7fr .7fr', gap: 1, px: 1.7, py: 1, bgcolor: '#f7f9f8', color: 'text.secondary', fontSize: 11, fontWeight: 750 }}>
                        <span>数据来源</span><span>活动数据</span><span>排放因子</span><span>时间范围</span><span>证据</span><span>状态</span>
                      </Box>
                      {visibleRecords.map((record) => (
                        <Box key={record.id} role="button" tabIndex={0} onClick={() => store.selectRecord(record.id)} sx={{ display: 'grid', gridTemplateColumns: '1.7fr .9fr .8fr 1fr .7fr .7fr', gap: 1, px: 1.7, py: 1.25, borderTop: '1px solid #e8ecea', cursor: 'pointer', bgcolor: selected.id === record.id ? '#eff7f3' : 'white', '&:hover': { bgcolor: '#f6faf8' } }}>
                          <Box><Typography fontSize={12.5} fontWeight={700}>{record.source}</Typography><Typography fontSize={10} color="text.secondary">{record.id} · {record.owner} · V{record.revision}</Typography></Box>
                          <Box><Typography fontSize={12}>{record.activity.toLocaleString()} {record.unit}</Typography><Typography fontSize={10} color={record.anomaly > 5 ? 'secondary.main' : 'text.secondary'}>异常 {record.anomaly > 0 ? '+' : ''}{record.anomaly}%</Typography></Box>
                          <Typography fontSize={12}>{record.factor} <small>{record.factorUnit}</small></Typography>
                          <Typography fontSize={11}>{record.timeRange}</Typography>
                          <Typography fontSize={12}>{record.evidenceCount} 项</Typography>
                          <Chip size="small" label={record.status} color={record.status === '已核验' ? 'success' : record.status === '需补证' ? 'warning' : 'default'} variant={record.status === '已核验' ? 'filled' : 'outlined'} />
                        </Box>
                      ))}
                    </Box>
                  </Box>
                </Card>
                <Stack spacing={1.5}>
                  <Card elevation={0} variant="outlined"><CardContent><Stack direction="row" justifyContent="space-between" alignItems="center"><Typography fontWeight={800} fontSize={14}>计算链展开</Typography><Chip size="small" label={selected.id} /></Stack><Box sx={{ mt: 1.5, p: 1.3, bgcolor: '#f4f7f5', fontFamily: 'monospace', borderRadius: 1, fontSize: 11 }}>
                    <Box>活动数据 = {selected.activity.toLocaleString()} {selected.unit}</Box>
                    <Box mt={.6}>排放因子 = {selected.factor} {selected.factorUnit}</Box>
                    <Box mt={.6}>换算系数 = 0.001</Box>
                    <Divider sx={{ my: 1 }} />
                    <Box sx={{ color: '#14644f', fontWeight: 800 }}>减排量 = {(selected.activity * selected.factor / 1000).toFixed(2)} tCO₂e</Box>
                  </Box><Stack direction="row" spacing={1} mt={1.5}><Button size="small" variant="outlined" onClick={() => { setCorrectionOpen(true); setCorrectionValue(String(selected.activity)); }}>修订数据</Button><Button size="small">查看证据</Button></Stack></CardContent></Card>
                  <Card elevation={0} variant="outlined"><CardContent><Typography fontWeight={800} fontSize={14} mb={1.2}>核验发现项</Typography>{openFindings.slice(0, 3).map((finding) => <Box key={finding.id} sx={{ py: 1, borderTop: '1px solid #edf0ef' }}><Stack direction="row" spacing={1}><Alert severity={finding.status === '补证中' ? 'warning' : 'error'} sx={{ p: .2, '& .MuiAlert-icon': { mr: .3, fontSize: 17 } }} /><Box><Typography fontSize={12} fontWeight={700}>{finding.title}</Typography><Typography fontSize={10} color="text.secondary" mt={.3}>{finding.assignee} · {finding.due}</Typography></Box></Stack></Box>)}</CardContent></Card>
                </Stack>
              </Box>
            </>
          )}

          {view === 'verify' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) 340px' }, gap: 1.5 }}>
              <Card elevation={0} variant="outlined">
                <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1} sx={{ p: 1.6 }}>
                  <Box><Typography fontWeight={800} fontSize={14}>证据矩阵与抽样任务</Typography><Typography fontSize={11} color="text.secondary">已抽取 {store.sampledIds.length} 条高价值记录</Typography></Box>
                  <Stack direction="row" spacing={1}><Button variant="outlined" onClick={() => useCarbonStore.setState((state) => ({ sampledIds: store.records.filter((item) => Math.abs(item.anomaly) > 5).map((item) => item.id) }))}>按异常抽样</Button><Button variant="contained" onClick={store.batchVerify}>批量核验</Button></Stack>
                </Stack><Divider />
                {store.records.map((record) => (
                  <Box key={record.id} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '22px minmax(210px, 1.3fr) .8fr .8fr .8fr auto' }, alignItems: 'center', gap: 1.2, px: 1.6, py: 1.3, borderTop: '1px solid #edf0ef' }}>
                    <input type="checkbox" checked={store.sampledIds.includes(record.id)} onChange={() => handleToggleSample(record.id)} aria-label={`抽样 ${record.id}`} />
                    <Box><Typography fontSize={12.5} fontWeight={700}>{record.source}</Typography><Typography fontSize={10} color="text.secondary">{record.id} · 证据 {record.evidenceCount} 份</Typography></Box>
                    <Box><Typography variant="caption" color="text.secondary">来源</Typography><Typography fontSize={11}>原始计量记录</Typography></Box>
                    <Box><Typography variant="caption" color="text.secondary">单位</Typography><Typography fontSize={11}>{record.unit} / {record.factorUnit}</Typography></Box>
                    <Box><Typography variant="caption" color="text.secondary">时间范围</Typography><Typography fontSize={11}>{record.timeRange.includes('至') ? '已覆盖整期' : '待检查'}</Typography></Box>
                    <Stack direction="row" spacing={.7} flexWrap="wrap" useFlexGap><Button size="small" variant="outlined" onClick={() => store.startCorrection(record.id)}>复核</Button><Button size="small" variant="contained" disabled={record.status === '需补证'} onClick={() => store.verifyRecord(record.id)}>通过</Button><Button size="small" variant="outlined" color="secondary" onClick={() => handleSupplement(record)}>补证</Button><Button size="small" variant="outlined" color="secondary" onClick={() => openFactorDialog(record)}>更新因子</Button></Stack>
                  </Box>
                ))}
              </Card>
              <Stack spacing={1.5}>
                <Card elevation={0} variant="outlined"><CardContent><Typography fontWeight={800} fontSize={14} mb={1.3}>发现项闭环</Typography>{store.findings.map((finding) => <Box key={finding.id} sx={{ borderTop: '1px solid #edf0ef', py: 1.2 }}><Stack direction="row" justifyContent="space-between"><Typography fontSize={12} fontWeight={700}>{finding.title}</Typography><Chip size="small" label={finding.status} color={finding.status === '已关闭' ? 'success' : finding.status === '补证中' ? 'warning' : 'error'} /></Stack><Typography fontSize={10.5} color="text.secondary" mt={.5}>{finding.detail}</Typography><Stack direction="row" spacing={.7} mt={1}><Button size="small" disabled={finding.status === '已关闭'} onClick={() => store.requestEvidence(finding.id)}>发起补证</Button><Button size="small" disabled={finding.status === '已关闭'} onClick={() => store.closeFinding(finding.id)}>关闭</Button></Stack></Box>)}</CardContent></Card>
                <Alert severity="info">任何数据修订都会生成新版本，原始提交和计算链不会被覆盖。</Alert>
                <Card elevation={0} variant="outlined">
                  <CardContent>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                      <Stack direction="row" spacing={.7} alignItems="center">
                        <DrawOutlined color="primary" fontSize="small" />
                        <Typography fontWeight={800} fontSize={14}>签字与版本</Typography>
                      </Stack>
                      <Chip size="small" variant="outlined" label={`数据版本 V${dataVersion}`} />
                    </Stack>
                    <Typography fontSize={11} color="text.secondary" mt={.5}>签字时冻结抽样范围、证据份数与因子版本；数据变更后旧签字失效，仅生成待复核副本，原签字仍可查。</Typography>
                    <Box sx={{ mt: 1.2, p: 1.2, bgcolor: '#f4f7f5', borderRadius: 1 }}>
                      <Typography fontSize={11} color="text.secondary">冻结快照（页面打开时 V{baseVersion ?? '-'}）</Typography>
                      <Typography fontSize={12.5} fontWeight={700} mt={.3}>{snapshotSummary(currentSnapshot)}</Typography>
                      <Stack direction="row" spacing={.5} mt={.7} flexWrap="wrap" useFlexGap>
                        {currentSnapshot.sampledIds.map((id) => <Chip key={id} size="small" label={id} variant="outlined" />)}
                      </Stack>
                    </Box>
                    <Stack direction="row" spacing={1} mt={1.2}>
                      <TextField size="small" select label="核验员" value={signActor} onChange={(event) => setSignActor(event.target.value)} sx={{ width: 116 }}>
                        <MenuItem value="沈楠">沈楠</MenuItem>
                        <MenuItem value="韩跃">韩跃</MenuItem>
                      </TextField>
                      <TextField fullWidth size="small" label="签字意见" value={signNote} onChange={(event) => setSignNote(event.target.value)} placeholder="如：抽样范围与证据链已核对" />
                    </Stack>
                    <Stack direction="row" spacing={1} mt={1.2} alignItems="center" flexWrap="wrap" useFlexGap>
                      <Button size="small" variant="contained" startIcon={<CheckCircleOutlined />} disabled={!signNote.trim() || baseVersion == null || signMutation.isPending} onClick={() => handleSign()}>签字提交</Button>
                      <FormControlLabel control={<Switch size="small" checked={simulateFailure} onChange={(event) => setSimulateFailure(event.target.checked)} />} label={<Typography fontSize={11}>模拟写入失败（确认丢失）</Typography>} />
                    </Stack>
                    {conflict && (
                      <Alert severity="warning" sx={{ mt: 1.2 }}>
                        <Typography fontSize={12.5} fontWeight={700}>版本冲突：打开页面时为 V{conflict.baseVersion}，当前已为 V{conflict.currentVersion}</Typography>
                        <Typography fontSize={11.5} mt={.3}>以下变化导致失效：</Typography>
                        <Box component="ul" sx={{ m: 0, pl: 2.2, mt: .3 }}>
                          {conflict.sources.map((source, index) => (
                            <Typography key={index} component="li" fontSize={11.5}>{source.type}{source.recordId ? ` ${source.recordId}` : ''}：{source.from} → {source.to}</Typography>
                          ))}
                        </Box>
                        <Typography fontSize={11.5} mt={.3}>已保留你填写的内容并生成待复核副本 {conflict.draft.id}。</Typography>
                        <Stack direction="row" spacing={1} mt={.8}>
                          <Button size="small" variant="outlined" onClick={() => handleConfirmDraft(conflict.draft)}>基于当前版本重新签字</Button>
                        </Stack>
                      </Alert>
                    )}
                    {failedRequest && (
                      <Alert severity="error" sx={{ mt: 1.2 }}>
                        <Typography fontSize={12.5} fontWeight={700}>写入失败，确认丢失</Typography>
                        <Typography fontSize={11.5} mt={.3}>请求编号 {failedRequest.requestId}。服务端可能已写入，重试使用原编号幂等回放，不会追加重复核验记录。</Typography>
                        <Button size="small" variant="outlined" sx={{ mt: .8 }} onClick={handleRetry} disabled={signMutation.isPending}>用原请求编号重试</Button>
                      </Alert>
                    )}
                    <Divider sx={{ my: 1.3 }} />
                    <Typography fontSize={12} fontWeight={700}>签字记录</Typography>
                    <Stack spacing={.8} mt={.8}>
                      {(signoffsQuery.data?.signOffs ?? []).length === 0 && <Typography fontSize={11.5} color="text.secondary">暂无签字记录。</Typography>}
                      {signoffsQuery.data?.signOffs.map((sign) => (
                        <Box key={sign.id} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}>
                          <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Stack direction="row" spacing={.7} alignItems="center">
                              <Chip size="small" label={sign.status} color={sign.status === '有效' ? 'success' : sign.status === '已失效' ? 'default' : sign.status === '待复核副本' ? 'warning' : 'info'} variant={sign.status === '有效' ? 'filled' : 'outlined'} />
                              <Typography fontSize={12} fontWeight={700}>{sign.actor}</Typography>
                            </Stack>
                            <Typography fontSize={10.5} color="text.secondary">V{sign.baseVersion} · {new Date(sign.createdAt).toLocaleTimeString('zh-CN', { hour12: false })}</Typography>
                          </Stack>
                          <Typography fontSize={11.5} mt={.4}>{sign.note || '（未填写意见）'}</Typography>
                          <Typography fontSize={10.5} color="text.secondary" mt={.3}>{snapshotSummary(sign.snapshot)}</Typography>
                          {sign.status === '已失效' && sign.sources && sign.sources.length > 0 && (
                            <Typography fontSize={10.5} color="warning.main" mt={.3}>失效来源：{sign.sources.map((source) => `${source.type}${source.recordId ? ` ${source.recordId}` : ''} ${source.from}→${source.to}`).join('；')}</Typography>
                          )}
                          {sign.status === '待复核副本' && (
                            <Button size="small" variant="outlined" sx={{ mt: .6 }} onClick={() => handleConfirmDraft(sign)}>基于此副本签字</Button>
                          )}
                          {sign.supersedesId && <Typography fontSize={10.5} color="text.secondary" mt={.3}>承接原签字 {sign.supersedesId}</Typography>}
                          {sign.supersededById && <Typography fontSize={10.5} color="text.secondary" mt={.3}>已由 {sign.supersededById} 承接</Typography>}
                        </Box>
                      ))}
                    </Stack>
                  </CardContent>
                </Card>
              </Stack>
            </Box>
          )}

          {view === 'issuance' && (
            <>
              <Alert
                severity={validSignOff ? 'success' : 'warning'}
                sx={{ mb: 1.5 }}
                action={!validSignOff ? <Button color="inherit" size="small" component={Link} href="/verify">去签字</Button> : undefined}
              >
                {validSignOff
                  ? `签字有效 · 版本 V${dataVersion} · 抽样 ${validSignOff.snapshot.sampledIds.length} 条已冻结，可提交签发准备。`
                  : signoffsQuery.data?.signOffs.some((item) => item.status === '已失效')
                    ? '签字已失效：数据版本已更新，已生成待复核副本，重新签字后门禁才会放行。'
                    : '尚未签字：请先在证据与抽样核验页完成签字，冻结抽样范围、证据份数与因子版本。'}
              </Alert>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'minmax(0, 1fr) 380px' }, gap: 1.5 }}>
              <Card elevation={0} variant="outlined">
                <CardContent>
                  <Typography fontWeight={800} fontSize={14}>签发前完整性检查</Typography>
                  <Typography fontSize={11} color="text.secondary" mb={1.5}>所有门禁项必须确认，开放发现项必须关闭。</Typography>
                  {[
                    { id: 'evidence', title: '证据与计算链完整', detail: '活动数据、排放因子、来源证据与修订说明可追溯。' },
                    { id: 'calculation', title: '计算过程复核通过', detail: '单位和换算系数一致，关键公式由核验员确认。' },
                    { id: 'revisions', title: '历史修订未覆盖原始数据', detail: '所有数据均有版本号和修订原因。' },
                    { id: 'methodology', title: '方法学与监测计划匹配', detail: `项目采用 ${data?.project.methodology ?? 'CMS-052-V01'}。` }
                  ].map((item) => <Box key={item.id} component="label" sx={{ display: 'flex', gap: 1.3, alignItems: 'flex-start', borderTop: '1px solid #edf0ef', py: 1.5, cursor: 'pointer' }}><input type="checkbox" checked={store.issuanceChecks[item.id]} onChange={() => store.toggleIssuanceCheck(item.id)} /><Box><Typography fontSize={12.5} fontWeight={700}>{item.title}</Typography><Typography fontSize={10.5} color="text.secondary" mt={.4}>{item.detail}</Typography></Box></Box>)}
                </CardContent>
              </Card>
              <Stack spacing={1.5}>
                <Card elevation={0} variant="outlined"><CardContent><Typography fontWeight={800} fontSize={14}>签发就绪度</Typography><Stack direction="row" alignItems="baseline" spacing={1} mt={1}><Typography variant="h4" fontWeight={850}>{Math.round(Object.values(store.issuanceChecks).filter(Boolean).length / 4 * 70 + (openFindings.length === 0 ? 30 : 0))}%</Typography><Typography fontSize={11} color="text.secondary">完成度</Typography></Stack><LinearProgress variant="determinate" value={Object.values(store.issuanceChecks).filter(Boolean).length / 4 * 100} sx={{ height: 7, borderRadius: 3, mt: 1 }} /><Typography fontSize={11} color="text.secondary" mt={1.2}>还有 {openFindings.length} 个开放发现项。</Typography></CardContent></Card>
                <Card elevation={0} variant="outlined"><CardContent><Stack direction="row" justifyContent="space-between"><Typography fontWeight={800} fontSize={14}>版本与核验意见</Typography><IconButton size="small"><MoreHorizOutlined /></IconButton></Stack>{[['V4', '韩跃', '修订柴油活动数据并补充测试运行说明'], ['V3', '沈楠', '要求补充流量计校准证据'], ['V2', '徐璐', '统一电量单位并附原始记录']].map((item) => <Stack key={item[0]} direction="row" spacing={1.2} sx={{ borderTop: '1px solid #edf0ef', py: 1.2 }}><Chip size="small" label={item[0]} /><Box><Typography fontSize={11.5} fontWeight={700}>{item[1]}</Typography><Typography fontSize={10.5} color="text.secondary">{item[2]}</Typography></Box></Stack>)}</CardContent></Card>
                <Alert severity={allIssuanceChecked ? 'success' : 'warning'}>{allIssuanceChecked ? '全部门禁已完成，可提交签发准备。' : '关闭开放发现项并完成所有检查后可提交。'}</Alert>
              </Stack>
            </Box>
            </>
          )}
        </Box>
      </Box>

      <Tooltip title="核验记录会写入审计链"><Button sx={{ position: 'fixed', bottom: 18, right: 18, zIndex: 5 }} variant="contained" size="small" startIcon={<FactCheckOutlined />}>操作均留痕</Button></Tooltip>
      {correctionOpen && (
        <Box sx={{ position: 'fixed', inset: 0, zIndex: 60, bgcolor: 'rgba(15,25,22,.4)', display: 'grid', placeItems: 'center', p: 2 }} onMouseDown={() => setCorrectionOpen(false)}>
          <Card sx={{ width: 'min(520px, 100%)' }} onMouseDown={(event) => event.stopPropagation()}><CardContent sx={{ p: 2.2 }}>
            <Typography variant="h6" fontWeight={800}>修订活动数据</Typography>
            <Typography variant="body2" color="text.secondary" mt={.5}>当前值 {selected.activity.toLocaleString()} {selected.unit}。修订将生成 V{selected.revision + 1}，原始版本保持不变。</Typography>
            <TextField fullWidth size="small" label={`修订值 / ${selected.unit}`} value={correctionValue} onChange={(event) => setCorrectionValue(event.target.value)} margin="normal" />
            <TextField fullWidth size="small" label="修订原因" multiline rows={3} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} margin="normal" />
            {!correctionReason.trim() && <Alert severity="warning">必须填写修订原因。</Alert>}
            <Stack direction="row" spacing={1} justifyContent="flex-end" mt={2}><Button onClick={() => setCorrectionOpen(false)}>取消</Button><Button variant="contained" disabled={!correctionReason.trim() || !Number(correctionValue)} onClick={() => { store.reviseValue(selected.id, Number(correctionValue), correctionReason); setCorrectionOpen(false); setCorrectionReason(''); }}>生成新版本</Button></Stack>
          </CardContent></Card>
        </Box>
      )}
      {factorOpen && (
        <Box sx={{ position: 'fixed', inset: 0, zIndex: 60, bgcolor: 'rgba(15,25,22,.4)', display: 'grid', placeItems: 'center', p: 2 }} onMouseDown={() => setFactorOpen(false)}>
          <Card sx={{ width: 'min(420px, 100%)' }} onMouseDown={(event) => event.stopPropagation()}><CardContent sx={{ p: 2.2 }}>
            <Typography variant="h6" fontWeight={800}>更新排放因子</Typography>
            <Typography variant="body2" color="text.secondary" mt={.5}>{factorTarget?.id} · {factorTarget?.source}。更新将冻结新版本因子，旧签字失效并生成待复核副本。</Typography>
            <TextField fullWidth size="small" label={`排放因子 / ${factorTarget?.factorUnit ?? ''}`} value={factorValue} onChange={(event) => setFactorValue(event.target.value)} margin="normal" />
            <Stack direction="row" spacing={1} justifyContent="flex-end" mt={2}><Button onClick={() => setFactorOpen(false)}>取消</Button><Button variant="contained" disabled={!Number(factorValue)} onClick={handleFactorUpdate}>更新因子</Button></Stack>
          </CardContent></Card>
        </Box>
      )}
    </Box>
  );
}
