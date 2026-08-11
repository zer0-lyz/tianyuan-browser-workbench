# 微信与企业微信文件归档 MVP 测试证据

## 自动化验证

- 全量测试：`node --test tests/*.cjs tests/*.mjs`
- 结果：`29/29` 通过。
- 新增测试：`tests/file-archive.test.cjs`
- 覆盖：微信目录检测、部分下载过滤、稳定等待、中文和特殊文件名、未知来源复制、SHA-256 回读、去重、源目录保护。
- 语法检查：`native-helper/file-archive.js`、`native-helper/native_host.js`、`extension/src/modules/file-archive/module.js`、`scripts/install-local-runtime.mjs` 通过。
- `git diff --check`：通过。
- 已同步到本机运行副本：`/Users/zer0y/.tianyuan-workbench/projects/天源评估系统/extension` 和 `/Users/zer0y/.tianyuan-workbench/native-helper/`。

## Native Messaging 检测

通过带长度前缀的 Native Messaging 帧直连执行：

```json
{
  "action": "detect_file_archive_apps"
}
```

当前 macOS 返回 `ok=true`，并识别到微信和企业微信的已知文件目录。检测只返回应用可用状态和目录数量，不返回聊天正文或凭据。

## 尚未完成的真实测试

尚未使用真实聊天文件执行端到端复制，原因是需要用户选择不敏感测试群和目标目录。下一次测试应验证：

1. 启动微信或企业微信并选择本机导出目录。
2. 使用测试群发送一个小型、不含敏感信息的文件。
3. 等待客户端显示下载完成。
4. 确认文件进入“来源未知待确认”目录。
5. 回读目标文件大小和 SHA-256，确认原文件未移动或删除。

## 明确限制

当前不能可靠识别文件来自哪个联系人或群聊。没有稳定会话 ID/文件消息元数据前，不允许自动归档到指定群；会话列表和群绑定属于第二阶段。
