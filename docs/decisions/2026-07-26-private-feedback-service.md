# 私有反馈服务与 GitHub App 架构决策

日期：2026-07-26

## 决策

天源浏览器工作台的用户反馈采用独立功能模块和私有接收服务，不允许浏览器扩展直接持有 GitHub token、Personal Access Token 或 GitHub App 私钥。

```text
浏览器反馈模块
        |
        | HTTPS，仅发送用户确认的白名单字段
        v
私有 /api/feedback
        |
        +-- 字段校验
        +-- 限流
        +-- 敏感信息脱敏
        +-- 匿名反馈编号
        +-- GitHub App 安装 token
                |
                v
私有 GitHub feedback 仓库 Issues
```

## 插件侧边界

- 反馈模块独立位于 `extension/src/modules/feedback/`。
- 草稿仅保存在扩展本机存储。
- 用户必须确认不包含客户资料或账号凭据。
- 插件主动拦截疑似 Bearer token、`zhmcp_` token、Cookie、Authorization 和本机用户路径。
- 安全环境信息仅包含版本、构建编号、运行指纹、系统、架构、Connector/MCP/CLI 状态、模块路由和采集时间。
- 不读取或提交项目 ID、公司 ID、科目、当前 URL、页面正文、附件、文件路径或账号凭据。
- 服务未配置时，只允许本机保存草稿和复制反馈，不显示虚假的提交成功。

## 服务侧边界

- 仅接受 `POST /api/feedback`。
- 请求正文上限 16 KiB，字段和长度严格白名单。
- CORS 只允许配置的固定扩展 ID。
- 使用匿名客户端摘要限流，不记录原始 IP 或原始反馈正文。
- 服务端再次脱敏疑似凭据和本机路径。
- 客户端不能指定仓库、任意标签、任意 URL 或标题前缀。
- GitHub App 只安装到私有反馈仓库，并只授予 `Issues: write` 和 `Metadata: read`。

## GitHub 资源

- 私有反馈仓库：`zer0-lyz/tianyuan-browser-workbench-feedback`
- Issues：已启用
- 标签：`feedback`、`feature`、`configuration`、`bug`、`experience`、`needs-triage`
- 公开 Release 仓库继续只用于版本发布，不接收私有反馈。

## 当前交付状态

- 插件反馈模块完成。
- 反馈服务源码和自动测试完成。
- 私有反馈仓库完成。
- GitHub App 和 HTTPS 服务部署尚未执行；需要选定托管平台后，在平台环境变量中配置 App ID、Installation ID 和私钥。
- 在服务部署完成前，`extension/feedback.json` 保持 `deliveryMode: "copy"`。
