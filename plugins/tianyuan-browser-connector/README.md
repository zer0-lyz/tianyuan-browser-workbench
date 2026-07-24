# 天源浏览器连接器

此插件把 Codex 路由到浏览器面板中已经绑定的天源页面。

当前提供只读能力：

- `tianyuan.connection_status`
- `tianyuan.list_sessions`
- `tianyuan.get_context`
- `tianyuan.list_capabilities`

并提供两个固定的浏览器脚本动作：

- `tianyuan.preview_audit_attachment_upload`
- `tianyuan.upload_audit_attachment`

上传动作只允许定位资产基础法底稿“查证资料索引”，不开放任意 JavaScript。正式执行必须传入 `确认上传并保存`，并经过编辑锁、附件上传、分类批次、底稿保存和单元格回读检查。

使用前必须在天源浏览器工作台中完成：

1. 启动 Connector；
2. 绑定当前天源页面；
3. 选择 Codex 项目和对话；
4. 保存绑定并取得 `bindingId`。

批量保存和退出编辑仍由浏览器工作台模块执行；Codex 当前只新增单个评估核实附件的受控上传。
