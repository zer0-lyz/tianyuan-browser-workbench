# 科目代码名称与显示状态过滤静态验证

时间：2026-07-22 23:20:57 CST

## 问题现象

用户截图显示：

- 科目树父级只显示 `C3`、`C3-1`，未显示科目名称。
- 科目叶子只显示名称，如 `现金`、`银行存款`。
- 隐藏科目仍进入插件选择清单。

## 修正内容

- 科目节点显示格式统一为 `科目代码 科目名称`。
- 当前科目默认项也显示为 `科目代码 科目名称`。
- MCP 显示状态字段识别扩展到：
  - `isDisplay/is_display`
  - `displayFlag/display_flag`
  - `displayStatus/display_status`
  - `showFlag/show_flag`
  - `visibleFlag/visible_flag`
  - `selected/isSelected/is_selected`
- 隐藏状态字段识别扩展到：
  - `is_hidden`
  - `is_hide`
  - `hiddenFlag/hidden_flag`
- 过滤值增加 `未显示`、`n`、`disabled`。
- 加载科目时刷新当前页面上下文，并用页面可见科目名称对 MCP 清单做二次过滤。
- 重新安装 Native Messaging Host 同步本机 helper 副本。

## 验证结果

- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `native-helper/native_host.js` 语法检查通过。
- `native-helper/server.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 本机 Native Host 安装副本检查通过。

## 后续验证

重新加载 Chrome 扩展后，点击“加载科目”。预期科目显示为 `C3-1-2 银行存款` 这类格式，并过滤隐藏科目。
