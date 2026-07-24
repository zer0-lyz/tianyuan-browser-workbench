# MCP 科目空项过滤静态验证

时间：2026-07-22 23:15:39 CST

## 问题现象

用户截图显示 MCP 已连接，但点击“加载科目”后失败：

- `Cannot read properties of null (reading 'code')`

## 判断

MCP 科目返回值解析后包含 `null` 或非对象项。前端 `normalizeMcpSubjects()` 和 helper `normalizeSubjects()` 的过滤链未先排除空项，导致读取 `code` 时崩溃。

## 修正内容

- 前端 `isDisplayedSubject()` 遇到空项直接返回 `false`。
- 前端 `normalizeMcpSubjects()` 先过滤空项和非对象项，再读取 `code`。
- Native Host `normalizeSubjects()` 过滤阶段先排除 `null`。
- HTTP helper `normalizeSubjects()` 过滤阶段先排除 `null`。
- 重新安装 Native Messaging Host 同步本机 helper 副本。

## 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `native-helper/native_host.js` 语法检查通过。
- `native-helper/server.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 本机 Native Host 安装副本检查通过。

## 后续验证

重新加载 Chrome 扩展后，点击“加载科目”。预期不再出现 `null.code` 错误。
