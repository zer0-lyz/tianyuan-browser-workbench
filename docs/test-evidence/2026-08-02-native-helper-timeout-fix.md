# Native Helper 更新检查超时修复证据

## 问题

点击“检查更新”后显示 `NATIVE_HELPER_TIMEOUT`。

## 根因

`native-helper/native_host.js` 原先在 Native Messaging stdin 结束时立即退出。一次性请求的异步 `check_github_update` 尚未完成时进程已结束，浏览器收不到回包。

## 修复

- Native Host 记录 pending 请求，stdin 结束后等待异步处理完成再退出。
- GitHub latest 权威清单命中后不再重复访问 API。
- 镜像、GitHub API 和可选清单增加分段超时，整个更新检查增加 `UPDATE_CHECK_TIMEOUT`。
- 扩展侧更新检查等待时间调整为高于 Helper 总超时，并显示可读错误。

## 验证

- `node tests/native-host-lifecycle.test.cjs`：通过。
- `node --test tests/update-checker.test.cjs tests/updates-module.test.mjs tests/static-extension-contract.test.cjs`：通过。
- Native Messaging 帧直连 `check_github_update`：约 6.6 秒返回结构化结果。
- 未记录或输出 token、Cookie、Authorization、密码或验证码。

## 未完成

尚未升级版本、构建 Windows 安装包或推送 GitHub；Windows 实机验收需使用包含本修复的新包。
