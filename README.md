# pair-wise-yy-60 碳减排项目监测证据核验与签发准备平台

按监测周期完成活动数据、排放因子、证据来源、异常波动和计算链核验。支持抽样任务、版本化数据修订、发现项闭环和签发前完整性检查。

## 技术栈

Next.js App Router、MUI、Zustand、TanStack Query、ky、Zod、TypeScript。

## 运行

```bash
npm install
npm run dev
```

访问 `http://localhost:62060`。`/api/evidence` 提供版本化工作簿与签字/更新动作接口；
`/api/evidence?legacy=1` 保留旧版只读响应结构。

```bash
npm run build
```

## 版本绑定与并发控制语义

- **三类数据同版本绑定**：核验员签字时，立即冻结当前抽样范围、每条抽样记录的证据份数和排放因子版本（`frozenSampleIds` + `frozen[*].evidenceCount/factorVersion`）。
- **更新即失效重算**：签字之后发生现场补证、因子版本更新或抽样范围调整，旧签字置为 `invalidated`（签字档案中原签字仍可查），系统只生成一份「待复核副本」（`reviewCopies`，保留原签字人填写的意见与失效来源），不会自动恢复签字；复核员基于副本重新签字后才有新的有效签字。
- **签发门禁不再假绿**：「证据与计算链完整」绿灯只统计 `status=active` 的签字；存在失效签字或仅有待复核副本时绿灯熄灭，门禁列出失效来源。
- **乐观并发**：页面打开时捕获 `baseVersion`，提交必须携带该版本；版本落后返回 `409 VERSION_CONFLICT`，带回冲突期间的版本变更、失效签字与失效来源。后到核验员的填写内容（核验意见、抽样勾选）保留在本地草稿中，不写入任何数据。
- **请求编号幂等**：每次用户意图生成一个 `requestId`，写入失败（5xx）时使用**同一请求编号**重试。服务端按请求编号缓存首次结果：重试命中即原样回放（响应带 `replayed: true`），审计链对每个请求编号只追加一条核验记录。可用 `simulate: "write-error"` 演练一次写入失败。

### 动作接口

`POST /api/evidence`，JSON body：

| kind | 关键字段 | 说明 |
| --- | --- | --- |
| `sign` | `baseVersion`、`signer`、`comment` | 冻结三类数据并签字 |
| `resign` | `baseVersion`、`copyId` | 依据待复核副本重新签字（沿用原填写内容） |
| `evidence` | `baseVersion`、`recordId`、`addCount`、`reason` | 现场补证（证据份数变化） |
| `factor` | `baseVersion`、`recordId`、`factor`、`factorVersion`、`reason` | 排放因子与版本更新 |
| `sample` | `baseVersion`、`sampledIds`、`reason` | 抽样范围调整 |

所有请求均需带 `requestId` 与 `actor`。200 响应包含完整工作簿；409 响应为 `VERSION_CONFLICT` 冲突载荷。
