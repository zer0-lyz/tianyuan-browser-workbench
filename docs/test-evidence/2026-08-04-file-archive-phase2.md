# 微信与企业微信文件归档第二阶段测试证据

## 自动化测试

- `node --test tests/*.cjs tests/*.mjs`：33/33 通过。
- 新增 `tests/file-archive-conversations.test.cjs`：4/4 通过。
- 覆盖：微信/企业微信加密数据库识别、本地会话清单绑定、目录绑定持久化、精确路径高置信度匹配、未绑定低置信度和路径不匹配。
- `git diff --check`、Node 语法检查和 Bash 安装/构建脚本语法检查通过。

## 本机真实 Native Messaging 验证

已从运行副本 `/Users/zer0y/.tianyuan-workbench/native-helper/native_host_launcher.sh` 发送：

```json
{"action":"list_file_archive_conversations","appType":"wechat"}
{"action":"list_file_archive_conversations","appType":"wecom"}
```

结果：

- 微信：`ok=true`，`available=false`，发现 4 个候选元数据文件，4 个均为加密或专有格式。
- 企业微信：`ok=true`，`available=false`，发现 4 个候选元数据文件，4 个均为加密或专有格式。
- 返回明确提示：会话数据库已加密，当前版本不会尝试解密或读取聊天正文，暂时无法可靠加载联系人和群聊。
- `security.credentialsReturned=false`，没有返回消息正文、Cookie、Authorization、密码、验证码或 token。

## 本机运行副本

- 扩展：`/Users/zer0y/.tianyuan-workbench/projects/天源评估系统/extension`
- Native Helper：`/Users/zer0y/.tianyuan-workbench/native-helper/`
- runtimeBuildId：`1eaabd0df63a4543586badd413bc3b28294c4f98ced5f254a0eb99079df12c7a`

## 当前边界

第二阶段的界面、绑定接口和置信度门禁已经具备，但当前本机没有可安全读取的真实会话清单。未接入官方或稳定的非正文元数据接口前，不会显示伪造清单，也不会按文件名、群名称或时间自动归档。
