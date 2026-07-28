# Cloudflare 私有反馈服务

日期：2026-07-28

## 决策

浏览器反馈模块的生产接收端采用 Cloudflare Worker 和私有 D1 数据库。用户端不需要 GitHub、Agent、MCP 或任何 token。

## 生产链路

```text
浏览器扩展
  -> HTTPS POST /api/feedback
  -> 固定扩展来源校验
  -> 字段白名单与长度限制
  -> 二次敏感信息脱敏
  -> 匿名限流
  -> 私有 D1 feedback 表
  -> 返回 TYF-YYYYMMDD-XXXXXXXX
```

## 安全边界

- 生产地址为 `https://feedback.zer0y.com/api/feedback`。
- 公网只开放反馈提交和不含业务数据的健康检查。
- 不提供公网反馈读取、修改或删除接口。
- 不保存 Cookie、Authorization、密码、验证码、MCP token 或原始 IP。
- 限流只保存带 Worker secret pepper 的不可逆客户端摘要。
- Cloudflare OAuth 凭据保存在本机 Wrangler 受限配置中，不进入仓库。
- 浏览器扩展只保存公开 HTTPS 地址，不保存 Cloudflare 或 GitHub 凭据。

## 数据管理

- Worker：`tianyuan-workbench-feedback`。
- D1：`tianyuan-workbench-feedback`，主区域 APAC。
- 反馈状态默认为 `new`。
- 维护人员通过 Cloudflare D1 控制台或受控 Wrangler 查询查看，不导出到公开仓库。

## GitHub App 适配

原 GitHub App 服务端代码保留为可选迁移路径，但生产版本 `0.14.0` 不使用 GitHub App，不要求用户拥有 GitHub 账号。
