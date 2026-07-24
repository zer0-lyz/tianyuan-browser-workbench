# 决策：公司和科目清单改由 MCP/native-helper 提供

日期：2026-07-22

## 背景

批量保存底稿需要在插件面板中加载公司清单和显示科目清单，由用户在面板内多选后确认执行。前一版尝试从天源页面 DOM、左侧科目树和公司选择弹窗读取清单，实测存在误触发页面动作、读取不完整、公司清单为空等问题。

## 决策

- 公司清单和资产基础法科目清单的主来源改为天源 MCP。
- 浏览器插件不直接保存或持有 MCP token。
- 新增本地 helper，监听 `127.0.0.1`，由本机环境变量 `VALUATION_MCP_TOKEN` 读取 token。
- 插件面板只访问本地 helper 的只读 JSON 接口，并把结果渲染为复选框。

## 当前接口

- `GET http://127.0.0.1:8765/health`
- `GET http://127.0.0.1:8765/projects/:projectId/companies`
- `GET http://127.0.0.1:8765/projects/:projectId/companies/:companyId/asset-subjects`

## 风险规则

- 不保存 Cookie、Authorization、密码、验证码或 token。
- helper 不向插件返回凭据。
- 当前 helper 只读取清单，不执行保存、上传或落库。
- 批量保存仍保留预演默认值；正式执行必须显式确认。
