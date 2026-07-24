# 右侧显示科目选择静态验证

时间：2026-07-22 23:09:22 CST

## 验证目标

按用户反馈修正“批量保存底稿”的科目选择：

- 加载科目后才显示全选、全不选和确认按钮。
- 批量保存前必须确认已加载的 MCP 科目选择。
- 只把右侧显示状态的科目放入选择清单，隐藏科目不进入批量任务。
- 科目树不再用硬编码中文分类猜测层级。

## 验证动作

- 检查 `extension/src/sidepanel/sidepanel.js` 语法。
- 检查 `native-helper/native_host.js` 语法。
- 检查 `native-helper/server.js` 语法。
- 检查 `extension/manifest.json` JSON 解析。
- 重新安装本机 Native Messaging Host。
- 检查安装副本 `~/.tianyuan-workbench/native-helper/native_host.js` 语法。
- 检查安装副本 `~/.tianyuan-workbench/native-helper/native_host_launcher.sh` shell 语法。

## 验证结果

- 语法检查通过。
- manifest JSON 解析通过。
- Native Host 已同步到本机安装目录。
- 未执行真实保存。

## 后续验证

重新加载扩展后，在真实底稿页点击“加载科目”，确认：

- 初始状态只显示“加载科目”。
- 加载完成后出现“全选 / 全不选 / 确认”。
- 列表只包含右侧显示状态科目。
- 确认前点击“运行批量保存”会提示先确认科目选择。
