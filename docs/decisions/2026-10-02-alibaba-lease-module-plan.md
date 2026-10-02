# 阿里资产租赁抓取模块方案（alibaba-lease）

日期：2026-10-02
状态：已实施（本分支），未部署运行副本
分支基线：`codex/anjuke-property-continuation-20261001`（5f474b1）

## 背景与需求

用户需要参考现有【阿里司法拍卖】模块，抓取阿里资产（zc-paimai.taobao.com 资产搜索频道）中的房产**租赁/使用权**案例。参考网址：

```
https://zc-paimai.taobao.com/wow/pm/default/pc/zichansearch?disableNav=YES&page=1
  &fcatV4Ids=["206060601"]&h_t_mode=[2,3]&structFieldMap={"h_t_mode":"[2,3]"}
  &statusOrders=["2"]&locationCodes=["330102"]
```

该频道结果为“住宅用房使用权拍卖”（流转方式=出租，成交价即首年租金，租期 3~5 年），是收益法租金可比案例来源。收益评估需要：成交/流拍状态、首年租金、租期、面积、楼层、装修、位置坐标等。

## 实测页面结论（2026-10-02，opencli 后台会话真实验证）

1. **列表页**（zichansearch，Rax SPA，数据走 mtop，DOM 渲染后可提取）：
   - 列表容器 `[class*="pc-search-list--area"]`，直接子元素即卡片，每页约 40 条。
   - 卡片文本字段：标题、小区、面积（80m²）、户型、区县、城市、当前价/拍下价/起始价、评估价/市场价、结束日期、围观、报名、状态（已结束等）；链接为 `zc-item.taobao.com/auction/<id>.htm`（租赁条目）或 `sf-item.taobao.com/sf_item/<id>.htm`（司法条目，非本模块目标）。
   - URL 参数语义（实测）：
     - `fcatV4Ids=["206060601"]` = 住宅用房类目；
     - `h_t_mode=[2,3]` + `structFieldMap` = **租赁/使用权过滤**（缺失时混入普通房产拍卖）；
     - `statusOrders=["2"]` = 已结束，`["1"]` = 进行中；
     - `locationCodes=["330102"]` = 区县行政区划代码（国标 6 位）；
     - `page=N` 分页有效，但**必须保留 h_t_mode 与 structFieldMap**，否则翻页后类目/租赁过滤丢失（实测第 2 页漏参时全部变成普通房产）。
   - 分页控件在 DOM 中存在，但直接按 URL 逐页导航更可控、与现有拍卖模块一致。
2. **详情页**（zc-item.taobao.com/auction/<id>.htm）：
   - 竞价区：标题、结束时间、当前价/拍下价、`本场已结束！`/`本场竞价失败，无人出价！`、报名/提醒/围观、保证金、起始价、评估价、加价幅度、延时周期、竞价周期、处置单位。
   - 结构化“标的物属性”键值块：流转方式（出租）、物业类型、房屋用途、小区名称、朝向、户型、建筑面积、所在楼层、总楼层、房源类型、装修程度。
   - “标的物详情描述”文本：首年租金起始价、租期（三年/5 年使用权）、租金支付方式（半年一付）、租金递增幅度（每年 +3%）、履约保证金（押金）、现使用/租赁情况。
   - “标的物位置”与页面脚本内 `lng/lat` 明文坐标（如 120.15/30.28），**无需地理编码**即可出地图。
   - “竞买记录 ( N )”提供出价次数。

## 方案

新增独立模块（MODULE_GUIDE：新功能优先新增独立模块；模块间禁止互相导入内部文件），复刻阿里司法拍卖的“当前标签页直驱”模式（依赖用户真实淘宝登录态，规避反爬与验证）。

### 模块结构

```
extension/src/modules/alibaba-lease/
├── module.js     # 清单、参数、URL 构建、列表/详情注入提取、解析校验、抓取主循环、生命周期
├── template.js   # 四段式界面（检索参数/输出位置/网络抓取/抓取结果），与拍卖模块对齐
└── styles.css    # 以 [data-module-id="alibaba-lease"] 为根
```

### 关键决策

1. **区域目录共享化**：区县下拉需要全国行政区划目录。现 `alibaba-auction/regions.js`（178KB）是该模块内部文件，按架构测试不能跨模块导入；拷贝一份则发布包重复 178KB。决定把它移动到 `extension/src/data/china-regions.js`（导出名不变 `ALIBABA_REGION_CATALOG`），拍卖模块改为单行 import 更新，由既有 `alibaba-auction-region-select.test.cjs` 回归保护。`data/` 为新增的共享静态数据层，仅放行政区划目录这类纯参考数据，不含业务逻辑。
2. **manifest 权限**：新增 `https://zc-paimai.taobao.com/*`、`https://zc-item.taobao.com/*` 主机权限（当前仅有 sf.taobao/sf-item，导航与 executeScript 会失败）。
3. **检索参数**（对齐参考 URL 语义，全部走 URL 参数、无需页面控件同步）：
   - 省份/城市/区县（locationCodes，默认浙江省杭州市上城区，与用户参考一致）；
   - 标的状态：已结束（statusOrders=["2"]，默认）/ 全部状态（["2","1"]）；
   - 租赁类型固定 `h_t_mode=[2,3]`+`structFieldMap`（住宅使用权/租赁过滤），类目固定 `fcatV4Ids=["206060601"]` 住宅用房；常量集中声明，后续扩展商业/厂房类目只改常量表；
   - 结束时间起止（作为本地过滤 + URL 无法表达时由详情页日期过滤）、关键词（标题本地过滤）、抓取页数（默认 1 页，1–5 页，逐页带全参导航，翻页间校验仍是租赁条目）。
4. **列表提取**（注入函数，仅依赖 DOM）：`[class*="pc-search-list--area"]` 子卡片 → { href→zc-item 规范链接、标题、小区、面积、户型、区县、城市、价格文本、结束日期、围观、报名、状态、listedHasEndedText、listedHasExplicitSoldPrice }；sf-item 链接直接排除；卡片标题/小区含“租金|使用权|出租”或链接为 zc-item 才进入候选。
5. **详情提取**：复用拍卖模块的手工验证等待框架（登录/验证码/页面替换三种阻断，5 分钟人工等待、暂停/终止），提取竞价区金额与状态、属性键值块（流转方式/面积/楼层/装修等）、描述文本（首年租金、租期、支付方式、递增、押金）、结束时间、报名/围观、竞买记录次数、脚本坐标、标的物位置。
6. **有效案例判据**（对齐拍卖模块“成交+出价>0”）：已结束文本存在，且（拍下价明确 或 竞买记录/出价次数>0），且“竞价失败/无人出价”不成立；再按日期范围、区县、关键词过滤。流拍记录保留在跳过原因中。
7. **输出字段**（RESULT_FIELDS）：标题、省市区、小区、流转方式、物业类型、房屋用途、建筑面积、成交价（首年租金/元）、起始价、评估价、月租金单价（元/㎡·月，成交价÷租期月数÷面积，仅面积与租期齐全时计算）、租期（年）、租金支付方式、租金递增、押金、朝向、户型、所在楼层、总楼层、装修程度、出价次数、报名人数、围观次数、结束时间、结果状态（成交/流拍）、经纬度、坐标状态、平台、核验状态、链接。
8. **输出产物**（native-helper/alibaba-lease.js）：输出目录默认受管子文件夹“阿里资产租赁”（chooseManagedOutputDirectory）；生成 `latest.html`（结果表+证据链接+状态横幅）、`latest.json`、`latest_map.html`（复用 map-assets 本地 Leaflet 资产 + ArcGIS 底图，点位直接用详情页坐标，无地理编码；资产缺失显式降级不生成地图）、`latest_history.json`；Excel 用 openpyxl（PYTHON_BIN 内联脚本，模式同拍卖模块 latest.xlsx）。
9. **不做**（记录为后续）：附件 OCR 补充（详情页结构化字段已齐全）、历史清单重抓 UI、非住宅类目、域名内 mtop 直连接口（DOM 提取已满足且更稳）。

### 集成点

- `sidepanel.js`：import + `moduleRegistry.register(alibabaLeaseModule)`。
- `index.html`：`page-alibaba-lease` 路由页 + 首页“数据抓取”区卡片（openAlibabaLease）。
- `native_host.js`：`select_alibaba_lease_output_directory` / `write_alibaba_lease_result` / `write_alibaba_lease_excel` / `open_alibaba_lease_path` 四个动作路由（该文件存在并行会话改动，提交时按 hunk 精确暂存）。
- `manifest.json`：host_permissions 两条。
- 测试：`tests/alibaba-lease-module.test.mjs`（契约+URL 构建+解析+列表/详情提取离线夹具）、`tests/alibaba-lease-native.test.cjs`（产物落盘+Excel 列契约）；`module-architecture.test.mjs` 计数 15→16、feature 13→14；`static-extension-contract.test.cjs` 若输出目录名单收口则同步新增“阿里资产租赁”。

### 验收边界

- 离线全量门禁 `bash scripts/quality-check.sh` 必须通过。
- 真实站点端到端（用户 Chrome 登录态下完整跑一次抓取）列为用户验收项；本会话已在 opencli 后台会话验证列表/详情/分页/坐标可提取。

## 实施记录（2026-10-02）

- 提交 `15d9753`（分支 `codex/anjuke-property-continuation-20261001`，基线含并行会话的 `fd35d86`——该提交卷入了本任务先暂存的 regions.js→data 重命名，纯 rename 无内容影响）。未推送、未发布、未覆盖本机运行副本。
- 与方案的差异（实施中发现并调整）：
  1. **坐标不可靠**：zc-item 详情页静态 HTML 的脚本坐标不稳定（同一条目首访有、复访无），因此地图定位改为两级：详情页坐标优先，缺失时对“标的物位置”文本走高德 poiTips（免钥）+ Nominatim 兜底（移植拍卖模块管线，缓存 `~/.tianyuan-workbench/cache/alibaba-lease-geocode.json`，预算 12s/300ms 限速），仍定位失败显式“未定位”。新增 `location` 字段与 Excel“标的物位置”列。
  2. **提取加固**（真实页面回归发现）：列表标题取卡片首行而非整卡 innerText；卡片金额捕获收紧（数字后禁止紧跟“年”，距离 ≤6 字符）避免把“结束 2026年…”误读为评估价；详情页起始价/评估价/押金正则补冒号；描述字段支持“1、租期：三年”编号前缀；parseTermYears 需收到含“年”的完整匹配。
- 真实页面验证（opencli 后台会话，用户登录态）：列表页 40 条/页（金额换算、日期归一、sf-item 排除）；成交案例（1081356663322）拍下价 16300/起始价 15300/租期 5 年/押金 7650/楼层 1/7/出价 2/月租金单价自动补算 8.47 元/㎡·月；流拍案例（1083334193009）failedNoBids=true、出价 0、正确判为跳过。
- 测试：`tests/alibaba-lease-module.test.mjs`（模块契约/URL 构建/解析判据/翻页停止）、`tests/alibaba-lease-native.test.cjs` 8 例（请求校验、行归一、产物落盘、地图显式降级、XSS 转义、Excel 真实回读含列契约、地理编码离线桩、路径越界拒绝）；`module-architecture.test.mjs` 15→16/13→14；`alibaba-auction-module.test.cjs` 区域路径更新。全量门禁 142/142 通过（两轮）。
- 部署待用户验收：需同步 audit 仓库 → `~/.tianyuan-workbench/projects/天源评估系统/extension`（含 native-helper）并在 chrome://extensions 重载；注意运行副本 native_host.js 含并行会话的折旧 `read_input` 路由，同步时以工作树版本为准（含双方改动），不要用本分支已提交版本覆盖。
