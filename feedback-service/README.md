# 天源浏览器工作台反馈服务

该服务接收浏览器扩展中由用户确认提交的反馈，完成字段校验、敏感信息脱敏、匿名限流和反馈编号生成，再通过 GitHub App 写入私有反馈仓库。

## 安全边界

- 不接受 Cookie、Authorization、token、密码、验证码或文件内容。
- 不接受项目、公司、科目、当前网址或本机文件路径字段。
- 不记录原始请求正文。
- GitHub App 私钥只放在部署环境变量中。
- GitHub App 仅授权私有反馈仓库的 `Issues: write` 和 `Metadata: read`。

## 环境变量

```text
PORT=8787
GITHUB_APP_ID=
GITHUB_APP_INSTALLATION_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_FEEDBACK_REPOSITORY=zer0-lyz/tianyuan-browser-workbench-feedback
FEEDBACK_ALLOWED_EXTENSION_IDS=lkflndcnklpeaejohaacoaolnmhgigoc,fdbllnmaaklkcmoacoapbibiggnndkfpa
FEEDBACK_RATE_LIMIT_MAX=10
FEEDBACK_RATE_LIMIT_WINDOW_MS=3600000
```

`GITHUB_APP_PRIVATE_KEY` 可以保存 PEM 原文，也可以用 `\n` 表示换行。不要把 `.env`、私钥或安装 token 提交到仓库。

## 本地验证

```bash
npm test
```

服务部署并获得 HTTPS 地址后，将扩展的 `feedback.json` 改为：

```json
{
  "schemaVersion": 1,
  "deliveryMode": "service",
  "endpoint": "https://your-feedback-host.example/api/feedback",
  "githubRepository": "zer0-lyz/tianyuan-browser-workbench-feedback",
  "githubIssuesEnabled": false,
  "publicChannel": false
}
```

同时需要把该 HTTPS 域名加入扩展 `manifest.json` 的 `host_permissions`，再重新打包。
