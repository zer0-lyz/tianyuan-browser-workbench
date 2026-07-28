# 天源浏览器工作台反馈服务

生产服务运行在 Cloudflare Worker，接收浏览器扩展中由用户确认提交的反馈，完成字段校验、敏感信息脱敏、匿名限流和反馈编号生成，再写入私有 D1 数据库。

## 安全边界

- 不接受 Cookie、Authorization、token、密码、验证码或文件内容。
- 不接受项目、公司、科目、当前网址或本机文件路径字段。
- 不记录原始请求正文。
- 公网只开放 `POST /api/feedback` 和不含业务数据的 `GET /health`。
- 不提供公网读取、修改或删除反馈的接口。
- `RATE_LIMIT_PEPPER` 只保存在 Cloudflare Worker secret 中。

## 生产资源

```text
Worker: tianyuan-workbench-feedback
Endpoint: https://feedback.zer0y.com/api/feedback
D1: tianyuan-workbench-feedback
Region: APAC
```

Cloudflare OAuth 凭据保存在本机 Wrangler 受限配置中；数据库 ID 可写入 `wrangler.jsonc`，它不是访问凭据。

## 部署与迁移

```bash
npm test
npx wrangler d1 migrations apply FEEDBACK_DB --remote
npx wrangler deploy
```

首次部署前生成限流 pepper，并直接写入 Worker secret，不要写入文件：

```bash
openssl rand -hex 32 | npx wrangler secret put RATE_LIMIT_PEPPER
```

## 查看反馈

在 Cloudflare 控制台进入 `存储和数据库 -> D1 -> tianyuan-workbench-feedback`。常用只读查询：

```sql
SELECT id, type, title, status, created_at
FROM feedback
ORDER BY created_at DESC;
```

反馈正文只在需要处理时查看，不导出到公开仓库或日志。

## 旧 GitHub App 适配

`src/index.js` 和 `src/github-app.js` 保留原 GitHub App 服务端适配作为可选迁移路径；生产扩展当前不使用它，也不在浏览器中保存 GitHub token 或私钥。
