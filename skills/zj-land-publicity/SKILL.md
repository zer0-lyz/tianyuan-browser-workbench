---
name: 浙江省自然资源厅土地成交数据抓取
description: "抓取浙江省自然资源网上交易系统（zjzrzyjy.com）土地成交公示数据。适用于抓取浙江自然资源土地成交公示、绍兴/金华等地区工业仓储用地成交数据；提取公示编号、地块信息、成交结果、受让单位等字段；解析 content 字段提取土地详情；保存为 Excel；可选导出 resourceCoordinate 坐标并生成地图。"
---

# 浙江自然资源土地成交公示抓取技能

## 概述

抓取浙江省自然资源网上交易系统（zjzrzyjy.com）的土地成交公示数据，从列表 API 获取全量记录，解析 content 字段中的 HTML 表格提取土地详情，整理后保存为 Excel。坐标功能优先读取详情接口 `queryResourceDetail` 的 `resourceCoordinate`，并可额外生成坐标 JSON / 地图 HTML；如果接口缺失，再回退到宗地界址图 PDF 渲染流程。

## 运行前确认

如果用户没有明确给出参数，不要默认全量抓取。先确认以下信息，再执行：

- 行政区名称，例如 `绍兴`、`镇海区`
- 起始年份，例如 `2025`
- 是否需要按 `districtName` 精确匹配，适合区县名
- 是否需要导出坐标，或同时生成地图
- 输出文件路径，若不提供则脚本会自动命名

如果信息不全，先询问用户，不要直接使用默认值跑全量。

## API 信息

### 列表接口
- **URL**: `https://www.zjzrzyjy.com/trade/view/publicity/queryPublicityList`
- **方法**: GET
- **参数**:
  - `type=3`: 成交公示类型
  - `current`: 页码
  - `size`: 每页条数（建议 50）
  - `sort=desc`: 按发布时间降序
- **Referer**: `https://www.zjzrzyjy.com/landWeb/publicityList`

### 附件文件接口（获取出让公告、勘测图等下载链接）
- **URL**: `https://www.zjzrzyjy.com/trade/view/landbidding/queryLandResourceUploadFile`
- **参数**:
  - `resourceId`: 地块 resourceId（sourceId）
  - `fileType=XZWJ`: 文件类型（其他类型包括 XCZP、QWT 等）
  - `currentPage=1&pageSize=200`
- **Referer**: `https://www.zjzrzyjy.com/landView/land-bidding/source-detail?resourceId={sourceId}`
- **PDF 下载 URL**: `https://file.zjzrzyjy.com/data/{日期}/{fileId}.pdf`
  - 示例: `https://file.zjzrzyjy.com/data/2026/03/25/2036703101888630784.pdf`

### 详情页 URL（source-detail 页面）
- **URL格式**: `https://www.zjzrzyjy.com/landView/land-bidding/source-detail?resourceId={sourceId}`
- **注意**: 该页面为 SPA 动态加载，需浏览器渲染才能获取容积率等字段

## 关键字段说明

| API字段 | 说明 |
|---------|------|
| `publicityId` | 公示编号（如 GS330114260509B017） |
| `sourceId` | 地块资源 ID（用于拼接 source-detail URL、获取附件列表） |
| `sourceCode` | 地块编号/宗地编码（也是公示标题） |
| `districtName` | 行政区名称 |
| `districtCode` | 行政区代码 |
| `releaseTime` | 发布时间 |
| `content` | HTML 格式的土地详情表格（最重要） |
| `tradeType` | 交易方式 |

### 字段清洗规则

1. **成交结果**: 去除"万元"、"元/平方米"等单位，只保留数字
2. **土地面积(平方米)**: 根据亩数计算 = 亩 × 666.67（保留 2 位小数）
3. **土地面积(亩)**: 从 HTML 提取数值
4. **出让年限**: 提取"数字+年"格式中的数字

## 输出字段

| 字段名 | 说明 | 来源 |
|--------|------|------|
| 公示编号 | publicityId | API |
| 公示标题 | sourceCode（宗地编码） | API |
| 行政区 | districtName | API |
| 地块编号（宗地编码） | sourceCode | API |
| 地块位置 | 地块位置描述 | HTML解析 |
| 土地用途 | 如二类工业用地 | HTML解析 |
| 土地面积(亩) | 亩数 | HTML解析 |
| 土地面积(平方米) | 平方米（计算值） | 亩×666.67 |
| 出让年限 | 如 50年 | HTML解析 |
| 成交结果 | 纯数字（万元） | HTML解析后清洗 |
| 受让单位 | 竞得单位 | HTML解析 |
| 发布时间 | 如 2026-04-17 | API |
| 详情页网址 | source-detail 完整 URL | 拼接 |
| 坐标类型* | `resourceCoordinate.locationType` | 详情接口 |
| 坐标中心经度* | `resourceCoordinate.center.lng` | 详情接口 |
| 坐标中心纬度* | `resourceCoordinate.center.lat` | 详情接口 |
| X坐标起点* | `resourceCoordinate.center.originLng` | 详情接口 |
| Y坐标起点* | `resourceCoordinate.center.originLat` | 详情接口 |
| 边界点组数* | `resourceCoordinate.pointGroups` 分组数 | 详情接口 |
| 边界点总数* | `resourceCoordinate.pointGroups.points` 总数 | 详情接口 |
| 坐标数据文件* | 坐标 JSON 文件 | 脚本生成 |
| 地图文件* | 地图 HTML 文件 | 脚本生成 |

*标注字段：使用 `--coords` 参数时生成；使用 `--map` 时同时生成地图 HTML/JS

## 坐标提取流程

### 步骤 1：启用坐标抓取
```bash
python scrape_zj_land.py 绍兴 2025 "/Volumes/A区/下载/绍兴数据.xlsx" --coords --map
```

### 步骤 2：脚本行为
1. 调用详情接口 `queryResourceDetail`，读取 `resourceCoordinate`
2. 在 Excel 中新增坐标列，并输出 `*_coords.json`
3. 运行 `--map` 时，额外生成 `*_map.html` 和 `*_points.js`
4. 如果详情接口未返回坐标，再回退到「宗地界址图」PDF 渲染流程

### 步骤 3：地图查看
生成的 `*_map.html` 可直接打开，地图上会按 `resourceCoordinate.center` 标注每宗地位置。

### 坐标说明
- 坐标系：2000国家大地坐标系 (CGCS2000)
- 地图点位：使用 `resourceCoordinate.center` 的经纬度
- 平面坐标：使用 `resourceCoordinate.center.originLng / originLat`

## 已知限制

1. **容积率**: source-detail 页面为 SPA，API/curl 无法直接获取，需 Playwright
2. **起始价**: 同上
3. **规划指标**: 同上（绿化率、建筑密度等）
4. **坐标缺失**: 少量记录可能没有 `resourceCoordinate`，会退回到 PDF 渲染辅助流程

## 抓取脚本

完整抓取脚本位于：`${SKILL_DIR}/scrape_zj_land.py`

用法示例：
```bash
# 默认抓取绍兴（不过滤年份）
python3 scrape_zj_land.py

# 抓取绍兴 2025 年以来数据
python3 scrape_zj_land.py 绍兴 2025

# 指定输出路径
python3 scrape_zj_land.py 绍兴 2025 "/Volumes/A区/下载/绍兴数据.xlsx"

# 开启坐标导出并生成地图
python3 scrape_zj_land.py 绍兴 2025 "/Volumes/A区/下载/绍兴数据.xlsx" --coords --map

# 按 districtName 精确匹配
python3 scrape_zj_land.py 某区 2023 "/Volumes/A区/下载/某区数据.xlsx" --coords --map --district-exact
```

参数：
- 第1个：城市名（默认绍兴）
- 第2个：起始年份（默认 2025）
- 第3个：输出文件路径（可选）
- `--coords`：是否提取勘测图坐标
- `--map`：是否生成地图 HTML/JS（会同时导出坐标）
- `--district-exact`：是否按 `districtName` 精确匹配

## 依赖

| 依赖 | 用途 | 安装 |
|------|------|------|
| requests | HTTP 请求 | `pip install requests` |
| openpyxl | Excel 写入 | `pip install openpyxl` |
| PyMuPDF | PDF 渲染为图像 | `pip install pymupdf` |

脚本已处理无依赖情况：`PyMuPDF` 不可用时坐标功能自动跳过。
