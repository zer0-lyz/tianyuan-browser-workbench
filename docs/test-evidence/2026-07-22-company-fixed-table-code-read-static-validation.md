# 公司固定列表格编码读取静态验证

时间：2026-07-22 23:53:16 CST

## 问题现象

公司列表仍显示平铺编号 `1/2/3/4/5/6`，不是系统页面表格中的层级编码。

## 判断

此前的兜底推导在页面表格编码未读取成功时生成了误导性平铺编号。真实页面可能使用 Element UI 固定列，`编码` 列在固定列容器中，`公司名称/公司简称/上级母公司` 在主体表格中，单一表格读取无法拿全列。

## 修正内容

- 新增 Element UI 固定列拆表读取：
  - 从固定列读取 `编码`。
  - 从主体表格读取 `公司名称/公司简称/上级母公司`。
  - 按可见行序号合并。
- 禁止在没有父级关系或页面编码时生成平铺假编号。
- 公司加载证据 JSON 增加：
  - `pageCompanyRows`
  - `normalizedCompanies`
- 如页面表格读取失败，任务日志会显示具体失败原因。

## 验证结果

- `extension/src/injected/page_adapter.js` 语法检查通过。
- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `native-helper/native_host.js` 语法检查通过。
- `native-helper/server.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。

## 后续验证

重新加载扩展后点击“加载清单”。若仍异常，复制证据 JSON 中 `pageCompanyRows` 和 `normalizedCompanies`。
