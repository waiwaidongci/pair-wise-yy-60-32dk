'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  AppBar,
  Avatar,
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
  Tab,
  Tabs,
  Toolbar,
  Tooltip,
  Typography
} from '@mui/material';
import {
  AccountTreeOutlined,
  AssessmentOutlined,
  CloudUploadOutlined,
  DashboardOutlined,
  FindInPageOutlined,
  MenuOutlined,
  NotificationsNoneOutlined,
  PostAddOutlined,
  ScienceOutlined,
  TaskAltOutlined,
  TravelExploreOutlined
} from '@mui/icons-material';
import { useWorkbook, useWorkbookActions } from '@/lib/useWorkbook';
import { useCarbonStore } from '@/lib/store';
import type { WorkbookRecord } from '@/lib/schema';
import ConflictBanner from './ConflictBanner';
import SignPanel from './SignPanel';
import UpdateDialog, { UpdateMode } from './UpdateDialog';
import VersionAuditCard from './VersionAuditCard';
import IssuancePanel from './IssuancePanel';

const drawerWidth = 232;
const actors = ['沈楠', '韩跃'];
type View = 'overview' | 'verify' | 'issuance';

export default function EvidenceWorkbench({ initialView }: { initialView: View }) {
  const [view] = useState<View>(initialView);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [recordFilter, setRecordFilter] = useState('全部');
  const [selectedId, setSelectedId] = useState('ACT-0318');
  const [dialog, setDialog] = useState<{ open: boolean; mode: UpdateMode; recordId: string | null }>({ open: false, mode: 'evidence', recordId: null });

  const { data: workbook, isLoading } = useWorkbook();
  const store = useCarbonStore();
  const { retryPending } = useWorkbookActions();

  // 打开页面时冻结基线版本；只在尚无基线时捕获（不随轮询/刷新漂移）
  useEffect(() => {
    if (workbook && useCarbonStore.getState().baseVersion === null) {
      useCarbonStore.getState().captureBaseVersion(workbook.version);
    }
  }, [workbook]);

  // 全局通知自动消失
  useEffect(() => {
    if (!store.notice) {
      return;
    }
    const timer = setTimeout(() => useCarbonStore.getState().setNotice(null), 6500);
    return () => clearTimeout(timer);
  }, [store.notice]);

  const records = workbook?.records ?? [];
  const selected = records.find((record) => record.id === selectedId) ?? records[0];
  const visibleRecords = useMemo(() => recordFilter === '全部' ? records : records.filter((record) => record.status === recordFilter), [recordFilter, records]);
  const openFindings = store.findings.filter((item) => item.status !== '已关闭');
  const activeSignatures = workbook?.signatures.filter((signature) => signature.status === 'active') ?? [];
  const totalReduction = records.reduce((total, record) => total + record.activity * record.factor / (record.unit === 'kWh' ? 1000 : record.unit === 'L' ? 1000 : 1), 0);

  const nav = [
    { id: 'overview', label: '监测期总览', href: '/', icon: DashboardOutlined },
    { id: 'verify', label: '证据与抽样核验', href: '/verify', icon: FindInPageOutlined },
    { id: 'issuance', label: '签发准备', href: '/issuance', icon: AssessmentOutlined }
  ];

  const openDialog = (mode: UpdateMode, recordId: string | null) => setDialog({ open: true, mode, recordId });
  const dialogRecord: WorkbookRecord | null = dialog.recordId ? records.find((record) => record.id === dialog.recordId) ?? null : null;

  const navDrawer = (
    <Box sx={{ width: drawerWidth, bgcolor: '#f8faf9', height: '100%' }}>
      <Box sx={{ p: 2.2, pt: 3 }}>
        <Typography variant="overline" color="text.secondary">当前项目</Typography>
        <Typography fontWeight={800} fontSize={13} mt={.5}>{workbook?.project.name ?? '临港工业园区能效提升项目'}</Typography>
        <Typography variant="caption" color="text.secondary">{workbook?.project.id ?? 'CN-ER-2026-041'}</Typography>
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
          <LinearProgress variant="determinate" value={workbook ? 60 + activeSignatures.length * 15 : 78} sx={{ height: 5, borderRadius: 2 }} />
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>{activeSignatures.length > 0 ? `已有 ${activeSignatures.length} 份签字在当前版本有效` : '等待有效签字冻结版本'}</Typography>
        </Box>
      </Box>
    </Box>
  );

  const conflict = store.conflict;
  const baselineStale = store.baseVersion !== null && workbook !== undefined && store.baseVersion !== workbook.version;

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
          {workbook && (
            <Tooltip title="所有签字、补证、因子更新都推进同一版本号；提交只接纳本页打开时的版本">
              <Chip size="small" label={`数据版本 V${workbook.version}`} sx={{ color: '#bfe3d6', borderColor: '#3f7a68', bgcolor: 'rgba(255,255,255,.05)' }} variant="outlined" />
            </Tooltip>
          )}
          <Chip size="small" label={`${openFindings.length} 项发现开放`} sx={{ color: '#ffdda7', borderColor: '#a87935', bgcolor: 'rgba(255,255,255,.05)' }} variant="outlined" />
          <Select
            size="small"
            value={store.actor}
            onChange={(event) => store.setActor(event.target.value)}
            sx={{ color: '#e9f4ef', fontSize: 12, height: 30, '& .MuiOutlinedInput-notchedOutline': { borderColor: 'rgba(255,255,255,.25)' }, '& .MuiSvgIcon-root': { color: '#a9c5bc' } }}
          >
            {actors.map((actor) => <MenuItem key={actor} value={actor} dense>核验员 · {actor}</MenuItem>)}
          </Select>
          <IconButton color="inherit"><NotificationsNoneOutlined /></IconButton>
          <Avatar sx={{ width: 30, height: 30, bgcolor: '#e1a45d', fontSize: 12 }}>{store.actor[0]}</Avatar>
        </Toolbar>
      </AppBar>
      <Drawer variant="permanent" sx={{ width: drawerWidth, flexShrink: 0, display: { xs: 'none', md: 'block' }, '& .MuiDrawer-paper': { width: drawerWidth, pt: '62px', boxSizing: 'border-box', borderRightColor: '#dce4e0' } }}>{navDrawer}</Drawer>
      <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)} ModalProps={{ keepMounted: true }} sx={{ display: { xs: 'block', md: 'none' }, '& .MuiDrawer-paper': { width: drawerWidth, pt: '62px' } }}>{navDrawer}</Drawer>

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, bgcolor: '#f2f5f3', pt: '62px' }}>
        <Box sx={{ p: { xs: 1.5, md: 3 }, maxWidth: 1640, mx: 'auto' }}>
          <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', md: 'center' }} spacing={2} mb={2.4}>
            <Box>
              <Typography variant="overline" color="text.secondary" fontWeight={750}>CN-ER-2026-041 / {workbook?.summary.period ?? '第三监测期'}</Typography>
              <Typography variant="h5" fontWeight={850} mt={.3}>{view === 'overview' ? '监测期总览' : view === 'verify' ? '证据与抽样核验' : '签发准备'}</Typography>
              <Typography variant="body2" color="text.secondary" mt={.5}>
                {view === 'overview' ? '汇总活动数据、排放因子、证据完整度和异常波动。' : view === 'verify' ? '签字冻结抽样范围、证据份数与因子版本；更新触发失效重算。' : '签发绿灯只认当前版本下的有效签字。'}
              </Typography>
            </Box>
            <Stack direction="row" spacing={1}>
              {view === 'verify' && (
                <Button variant="outlined" startIcon={<TravelExploreOutlined />} onClick={() => openDialog('sample', null)}>调整抽样范围</Button>
              )}
              <Button variant="outlined" startIcon={<CloudUploadOutlined />}>导入监测数据</Button>
              <Button variant="contained" startIcon={<TaskAltOutlined />} disabled={view !== 'issuance'} href="/issuance">提交签发准备</Button>
            </Stack>
          </Stack>
          {isLoading && <LinearProgress />}

          {conflict && (
            <Box mb={1.5}>
              <ConflictBanner conflict={conflict} onReopen={(current) => store.reopenAtCurrent(current)} />
            </Box>
          )}
          {store.pendingRequest && (
            <Box mb={1.5}>
              <Alert
                severity="error"
                action={<Button color="inherit" size="small" onClick={() => void retryPending()}>用原请求编号重试</Button>}
              >
                <Typography fontSize={12} fontWeight={700}>写入失败，请求 {store.pendingRequest.requestId} 已挂起</Typography>
                <Typography fontSize={11}>{store.pendingError} 重试将复用同一编号，服务端按编号去重，不会重复追加核验记录。</Typography>
              </Alert>
            </Box>
          )}

          {workbook && view === 'overview' && (
            <>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', lg: 'repeat(4, 1fr)' }, gap: 1.4, mb: 2 }}>
                {[
                  { label: '计算减排量', value: Math.round(totalReduction).toLocaleString(), unit: 'tCO₂e', note: '按当前因子版本实时计算' },
                  { label: '证据完整度', value: `${workbook.summary.evidenceRate}%`, unit: '', note: `${records.reduce((sum, record) => sum + record.evidenceCount, 0)} 份证据已归档` },
                  { label: '开放发现项', value: `${openFindings.length}`, unit: '项', note: activeSignatures.length ? `${activeSignatures.length} 份签字有效` : '尚无有效签字' },
                  { label: '抽样任务', value: `${workbook.sampledIds.length} / 18`, unit: '', note: `随 V${workbook.version} 冻结/调整` }
                ].map((item) => <Card elevation={0} variant="outlined" key={item.label}><CardContent sx={{ p: 1.8, '&:last-child': { pb: 1.8 } }}><Typography variant="caption" color="text.secondary">{item.label}</Typography><Stack direction="row" alignItems="baseline" spacing={.6} mt={.5}><Typography variant="h5" fontWeight={850}>{item.value}</Typography><Typography fontSize={12} color="text.secondary">{item.unit}</Typography></Stack><Typography fontSize={11} color="text.secondary" mt={.7}>{item.note}</Typography></CardContent></Card>)}
              </Box>
              <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1.55fr) minmax(300px, .7fr)' }, gap: 1.5 }}>
                <Card elevation={0} variant="outlined">
                  <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ p: 1.6 }}>
                    <Box><Typography fontWeight={800} fontSize={14}>活动数据与计算链</Typography><Typography fontSize={11} color="text.secondary">因子版本、证据份数与抽样范围同属一个冻结版本</Typography></Box>
                    <Tabs value={recordFilter} onChange={(_, value) => setRecordFilter(value)} variant="scrollable"><Tab value="全部" label="全部" /><Tab value="待核验" label="待核验" /><Tab value="需补证" label="需补证" /><Tab value="已核验" label="已核验" /></Tabs>
                  </Stack>
                  <Divider />
                  <Box sx={{ overflowX: 'auto' }}>
                    <Box sx={{ minWidth: 900 }}>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1.7fr .9fr 1.1fr 1fr .7fr .7fr', gap: 1, px: 1.7, py: 1, bgcolor: '#f7f9f8', color: 'text.secondary', fontSize: 11, fontWeight: 750 }}>
                        <span>数据来源</span><span>活动数据</span><span>排放因子 / 版本</span><span>时间范围</span><span>证据</span><span>状态</span>
                      </Box>
                      {visibleRecords.map((record) => (
                        <Box key={record.id} role="button" tabIndex={0} onClick={() => setSelectedId(record.id)} sx={{ display: 'grid', gridTemplateColumns: '1.7fr .9fr 1.1fr 1fr .7fr .7fr', gap: 1, px: 1.7, py: 1.25, borderTop: '1px solid #e8ecea', cursor: 'pointer', bgcolor: selected?.id === record.id ? '#eff7f3' : 'white', '&:hover': { bgcolor: '#f6faf8' } }}>
                          <Box><Typography fontSize={12.5} fontWeight={700}>{record.source}</Typography><Typography fontSize={10} color="text.secondary">{record.id} · {record.owner} · V{record.revision}</Typography></Box>
                          <Box><Typography fontSize={12}>{record.activity.toLocaleString()} {record.unit}</Typography><Typography fontSize={10} color={record.anomaly > 5 ? 'secondary.main' : 'text.secondary'}>异常 {record.anomaly > 0 ? '+' : ''}{record.anomaly}%</Typography></Box>
                          <Box><Typography fontSize={12}>{record.factor} <small>{record.factorUnit}</small></Typography><Typography fontSize={10} color="text.secondary">{record.factorVersion}</Typography></Box>
                          <Typography fontSize={11}>{record.timeRange}</Typography>
                          <Typography fontSize={12}>{record.evidenceCount} 份</Typography>
                          <Chip size="small" label={record.status} color={record.status === '已核验' ? 'success' : record.status === '需补证' ? 'warning' : 'default'} variant={record.status === '已核验' ? 'filled' : 'outlined'} />
                        </Box>
                      ))}
                    </Box>
                  </Box>
                </Card>
                <Stack spacing={1.5}>
                  {selected && (
                    <Card elevation={0} variant="outlined"><CardContent>
                      <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography fontWeight={800} fontSize={14}>计算链展开</Typography><Chip size="small" label={selected.id} /></Stack>
                      <Box sx={{ mt: 1.5, p: 1.3, bgcolor: '#f4f7f5', fontFamily: 'monospace', borderRadius: 1, fontSize: 11 }}>
                        <Box>活动数据 = {selected.activity.toLocaleString()} {selected.unit}</Box>
                        <Box mt={.6}>排放因子 = {selected.factor} {selected.factorUnit}</Box>
                        <Box mt={.6}>因子版本 = {selected.factorVersion}</Box>
                        <Box mt={.6}>换算系数 = 0.001</Box>
                        <Divider sx={{ my: 1 }} />
                        <Box sx={{ color: '#14644f', fontWeight: 800 }}>排放 = {(selected.activity * selected.factor / (selected.unit === 'kWh' || selected.unit === 'L' ? 1000 : 1)).toFixed(2)} tCO₂e</Box>
                      </Box>
                    </CardContent></Card>
                  )}
                  <VersionAuditCard workbook={workbook} />
                </Stack>
              </Box>
            </>
          )}

          {workbook && view === 'verify' && (
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', xl: 'minmax(0, 1fr) 380px' }, gap: 1.5 }}>
              <Stack spacing={1.5}>
                <Card elevation={0} variant="outlined">
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1} sx={{ p: 1.6 }}>
                    <Box>
                      <Typography fontWeight={800} fontSize={14}>证据矩阵与抽样任务</Typography>
                      <Typography fontSize={11} color="text.secondary">
                        已抽取 {workbook.sampledIds.length} 条 · 本页基线 V{store.baseVersion ?? '…'}，当前 V{workbook.version}
                        {baselineStale && <Chip component="span" size="small" color="warning" variant="outlined" label="基线已落后" sx={{ ml: 1, height: 20, fontSize: 10 }} />}
                      </Typography>
                    </Box>
                    <FormControlLabel
                      control={<input type="checkbox" checked={store.simulateWriteError} onChange={store.toggleSimulateWriteError} />}
                      label={<Typography fontSize={11}>下次提交模拟一次写入失败（同编号自动重试）</Typography>}
                    />
                  </Stack>
                  <Divider />
                  {records.map((record) => {
                    const sampled = workbook.sampledIds.includes(record.id);
                    return (
                      <Box key={record.id} sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '22px minmax(210px, 1.3fr) .9fr .9fr .9fr auto' }, alignItems: 'center', gap: 1.2, px: 1.6, py: 1.3, borderTop: '1px solid #edf0ef' }}>
                        <Tooltip title={sampled ? '在签字冻结的抽样范围内' : '未抽样'}><Box sx={{ width: 16, height: 16, borderRadius: '4px', border: sampled ? 'none' : '2px solid #9fb3ab', bgcolor: sampled ? 'primary.main' : 'transparent', display: 'grid', placeItems: 'center', color: 'white', fontSize: 11 }}>{sampled ? '✓' : ''}</Box></Tooltip>
                        <Box><Typography fontSize={12.5} fontWeight={700}>{record.source}</Typography><Typography fontSize={10} color="text.secondary">{record.id} · 证据 {record.evidenceCount} 份</Typography></Box>
                        <Box><Typography variant="caption" color="text.secondary">排放因子</Typography><Typography fontSize={11}>{record.factor}</Typography><Typography fontSize={10} color="text.secondary">{record.factorVersion}</Typography></Box>
                        <Box><Typography variant="caption" color="text.secondary">单位</Typography><Typography fontSize={11}>{record.unit} / {record.factorUnit}</Typography></Box>
                        <Box><Typography variant="caption" color="text.secondary">时间范围</Typography><Typography fontSize={11}>{record.timeRange.includes('至') ? '已覆盖整期' : '待检查'}</Typography></Box>
                        <Stack direction="row" spacing={.7}>
                          <Button size="small" variant="outlined" startIcon={<PostAddOutlined sx={{ fontSize: 15 }} />} onClick={() => openDialog('evidence', record.id)}>现场补证</Button>
                          <Button size="small" variant="outlined" onClick={() => openDialog('factor', record.id)}>因子更新</Button>
                        </Stack>
                      </Box>
                    );
                  })}
                </Card>
                <Alert severity="info">
                  签字冻结三类数据（抽样范围 / 证据份数 / 因子版本）。之后现场补证或因子更新会推进版本，旧签字立即失效、只生成待复核副本；原签字在右侧档案中仍可查。
                  并发演示：可在两个浏览器标签页同时打开本页，第一位核验员提交后，第二位（仍持打开时的版本）将收到冲突，填写内容保留并显示失效来源。
                </Alert>
                <Card elevation={0} variant="outlined"><CardContent sx={{ pb: '16px !important' }}>
                  <Typography fontWeight={800} fontSize={14} mb={1.2}>发现项闭环</Typography>
                  {store.findings.map((finding) => <Box key={finding.id} sx={{ borderTop: '1px solid #edf0ef', py: 1.2 }}><Stack direction="row" justifyContent="space-between"><Typography fontSize={12} fontWeight={700}>{finding.title}</Typography><Chip size="small" label={finding.status} color={finding.status === '已关闭' ? 'success' : finding.status === '补证中' ? 'warning' : 'error'} /></Stack><Typography fontSize={10.5} color="text.secondary" mt={.5}>{finding.detail}</Typography><Stack direction="row" spacing={.7} mt={1}><Button size="small" disabled={finding.status === '已关闭'} onClick={() => store.requestEvidence(finding.id)}>发起补证</Button><Button size="small" disabled={finding.status === '已关闭'} onClick={() => store.closeFinding(finding.id)}>关闭</Button></Stack></Box>)}
                </CardContent></Card>
              </Stack>
              <Stack spacing={1.5}>
                {workbook && <SignPanel workbook={workbook} />}
                <VersionAuditCard workbook={workbook} />
              </Stack>
            </Box>
          )}

          {workbook && view === 'issuance' && <IssuancePanel workbook={workbook} />}
        </Box>
      </Box>

      {store.notice && (
        <Box sx={{ position: 'fixed', left: 18, bottom: 18, zIndex: 70, maxWidth: 460 }}>
          <Alert
            severity={store.notice.severity}
            onClose={() => store.setNotice(null)}
            variant="filled"
          >
            <Typography fontSize={12}>{store.notice.text}</Typography>
          </Alert>
        </Box>
      )}

      {workbook && dialog.open && (
        <UpdateDialog
          open={dialog.open}
          mode={dialog.mode}
          record={dialogRecord}
          workbook={workbook}
          onClose={() => setDialog((prev) => ({ ...prev, open: false }))}
        />
      )}
    </Box>
  );
}
