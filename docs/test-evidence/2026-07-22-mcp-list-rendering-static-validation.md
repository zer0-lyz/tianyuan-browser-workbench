# MCP 清单渲染修正静态验证记录

日期：2026-07-22

## 修正内容

- 刷新页面时不再把 DOM 左侧科目树写入批量保存科目清单，只保留当前科目作为页面上下文提示。
- 点击“加载科目”后只使用 MCP 返回的科目清单，不再回退到页面左侧树脏文本。
- 公司清单区域默认显示，不再只在“部分公司”范围下显示。
- Native Host 和 HTTP helper 对 MCP 返回值增加递归展开，兼容 `data/list/result/items/children/tree` 等嵌套结构。
- 科目和公司字段增加更多兜底键名解析。

## 验证结果

- Native Host 副本已重新安装到 `~/.tianyuan-workbench/native-helper/`。
- `native-helper/native_host.js` 语法检查通过。
- `native-helper/server.js` 语法检查通过。
- `extension/src/sidepanel/sidepanel.js` 语法检查通过。
- `extension/src/content/content.js` 语法检查通过。
- `extension/manifest.json` JSON 解析通过。
- 扫描项目文件、Chrome 注册文件和本机 Native Host 安装目录，未发现完整 MCP token 落盘。

## 后续验证

- 重新加载扩展后，点击“加载科目”，确认面板不再出现“左侧显示科目”脏文本。
- 点击“加载清单”，确认公司列表可见并可多选。
