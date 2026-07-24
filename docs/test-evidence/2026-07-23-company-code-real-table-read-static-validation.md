# 公司真实编码读取修复静态验证

验证时间：2026-07-23 00:01:24 CST

## 背景

用户反馈公司编号应读取天源公司列表页的真实 `编码` 列，例如 `1`、`1-1`、`1-3-2`，不是 MCP 系统 ID，也不是插件按顺序推导出的编号。

## 修复内容

- `extension/src/injected/page_adapter.js`
  - `list_equity_table_companies` 改为异步等待公司列表页表格行渲染。
  - 读取主表时排除 Element UI 固定列副本。
  - 读取固定列时单独按 `编码/公司编号/层级编码/序号` 表头定位编码。
  - 支持固定编码列与主表公司名称/简称列分离的表格结构。
- `extension/src/sidepanel/sidepanel.js`
  - 移除公司编号显示中的父子顺序推导兜底。
  - 公司编号仅使用 MCP 或页面表格真实返回字段。

## 验证命令

```bash
node --check extension/src/injected/page_adapter.js
node --check extension/src/sidepanel/sidepanel.js
node --check extension/src/content/content.js
node --check extension/src/background/service_worker.js
node -e 'JSON.parse(require("fs").readFileSync("extension/manifest.json","utf8")); console.log("manifest ok")'
```

## 验证结果

- Manifest JSON 解析通过。
- 4 个插件 JS 文件语法检查通过。
- 未执行真实保存。
- 未读取或写入 Cookie、Authorization、密码、验证码或 token。

## 待现场确认

重新加载扩展后，在天源底稿页点击公司清单“加载清单”，检查侧栏是否显示 `编码 + 公司简称`。
