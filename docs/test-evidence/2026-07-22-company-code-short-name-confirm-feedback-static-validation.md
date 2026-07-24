# 公司编码简称与确认反馈静态验证

时间：2026-07-22 23:37:34 CST

## 问题现象

用户反馈：

- 点击公司“确认”后没有明显反馈。
- 公司列表前缀显示的是系统 ID，不是业务公司编号。
- 公司名称过长，需要显示为 `公司编号 公司简称`。

## 修正内容

- 公司标题旁新增确认状态：
  - 默认当前公司
  - 未确认
  - 已确认 N 个
- 点击公司确认后，直接在“公司清单”标题旁更新确认数量。
- 公司显示标题改为优先使用 `公司编号 公司简称`。
- 系统 ID 仍作为内部选择 value 使用，不再优先展示。
- helper 透传常见公司编码字段：
  - `companyCode/company_code`
  - `code`
  - `enterpriseCode/enterprise_code`
  - `companyNo/company_no`
  - `no`
- helper 透传常见简称字段：
  - `shortName/short_name`
  - `companyShortName/company_short_name`
  - `abbrName/abbr_name`
  - `abbreviation`
  - `companyAbbr/company_abbr`
- 默认当前公司显示为 `当前 当前公司`，避免显示长系统 ID。

## 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `native-helper/native_host.js` 语法检查通过。
- `native-helper/server.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 本机 Native Host 安装副本检查通过。

## 后续验证

重新加载 Chrome 扩展后，点击“加载清单”。如仍显示系统 ID，需查看证据 JSON 中对应公司的 `raw` 字段，以确认 MCP 实际返回的业务编码字段名。
