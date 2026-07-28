# 反馈服务 v0.14.0 测试证据

日期：2026-07-28

## 交付结果

- 生产 Worker：`tianyuan-workbench-feedback`。
- 生产地址：`https://feedback.zer0y.com/api/feedback`。
- 私有 D1：`tianyuan-workbench-feedback`，区域 APAC。
- 扩展版本：`0.14.0`，构建编号 `2026072801`。
- Connector 保持 `0.4.2`，本次无协议变更。

## 自动测试

- 根目录全部 CJS/MJS 测试通过。
- 反馈服务 7 项测试通过。
- 覆盖字段白名单、敏感信息脱敏、固定扩展来源、匿名限流、D1 保存、健康检查和反馈编号。
- 静态契约确认生产 `feedback.json` 使用 HTTPS 服务模式，并声明固定域名权限。

## 线上只读与模拟验收

- `GET /health` 返回 `ok=true`、服务名和私有存储标识。
- 以固定扩展来源提交“自动验收测试”，服务返回匿名反馈编号。
- D1 回读确认记录包含编号、类型、标题、状态和创建时间。
- 验收后按精确反馈编号删除该测试记录；D1 反馈数量回读为 0。
- 未提交任何客户、项目、公司、科目、附件、文件路径或账号凭据。
- 未执行任何天源线上上传、保存、清理或退出编辑动作。

## 本机同步

- 安装脚本执行成功。
- 扩展运行目录：`~/.tianyuan-workbench/projects/天源评估系统/extension`。
- Native Host 自检通过。
- Connector 重启成功。
- 本次未写入 MCP 凭据。

## 正式发布

- 源码提交：`09f80e0c2da955f0694514d355ee1369fe16683a`。
- 源码标签：`v0.14.0`。
- Windows SHA-256：`0e958366ea515df692604647b7ed93c9d2f8f986056118cacb6dcc3e36ed1487`。
- macOS SHA-256：`7a7af43f617ed04673ccde1adda7f5c0e4096c69b63aebc90b328bc4761d52b1`。
- 更新清单 SHA-256：`cede30a180eb00b2da29c9736f5aefb46b8b38190e9f4d7fb44da93371e5c7da`。
- 两个平台包均为 `source_dirty=false`，运行指纹为 `9e4300d474c0c4a5e5fe83e5c5627ff8901dad098465f7eac9aed685500406b2`。
- 公开 Release `v0.14.0` 已标记为 Latest，5 个资产均为 `uploaded`。
- 在线匿名更新检查确认：`0.13.2` 可发现 `0.14.0`，`0.14.0` 不重复提示，`tokenUsed=false`。
