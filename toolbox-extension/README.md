# 评估工具箱（toolbox-extension）

独立于天源底稿系统的浏览器侧边栏插件，收录不依赖天源页面绑定的采集与测算功能：

| 模块 | 目录 | 说明 |
| --- | --- | --- |
| 浙江土地市场网 | `src/modules/land-publicity` | 成交公示筛选，输出 Excel / HTML / 地图 |
| 阿里司法拍卖 | `src/modules/alibaba-auction` | 列表抓取 + 成交详情核验 |
| 阿里资产租赁 | `src/modules/alibaba-lease` | 使用权出租案例抓取 |
| 表格设置 | `src/modules/table-format` | 批量统一 Word 表格格式 |
| 安居客数据 | `src/modules/anjuke-property` | 物业出售/租赁案例与原始证据 |
| 折旧摊销与资本性支出预测 | `src/modules/depreciation-capex-forecast` | 长周期折旧摊销预测工作簿 |

## 与主工作台（extension/）的关系

- 模块代码从主工作台原样迁移，仅依赖通用 `context` 能力
  （`scope` / `storage` / `setStatus` / `navigate` / `document` / `manifest` / `chrome` /
  `sendNativeMessage` / `streamNativeMessage`），不引用任何天源底稿页面或 Connector 绑定。
- 复用同一个本机运行组件（native messaging host：`com.tianyuan.workbench.helper`）。
  所有抓取、Excel 导出、docx 处理和预测计算都由该 helper 完成，本插件不改 helper 代码。
- 扩展 ID 通过 `manifest.json` 的 `key` 固定为 `aamfmhcbjgofhmannejoiilkkpchfkgm`；
  私钥在 `.keys/toolbox-extension.pem`（不入库）。重装/换目录加载 ID 不变，
  因此 native host 白名单无需再改。
- 主工作台中的同名模块保持不变，两边可同时使用。

## 安装与加载

1. 运行 `scripts/install-local-runtime.mjs`（或 `native-helper/install_native_host.sh`）
   安装/更新本机运行组件——安装脚本会把本扩展 ID 写入 native host 的 `allowed_origins`。
2. Chrome 打开 `chrome://extensions` → 开发者模式 → 「加载已解压的扩展程序」
   → 选择本目录（`toolbox-extension/`）。
3. 点击工具栏图标打开侧边栏使用。

## 架构约束

与主工作台一致（见 `extension/src/modules/MODULE_GUIDE.md`）：

- 模块只能通过 `context` 使用公共能力，禁止跨模块 import 内部文件；
- 模块消息走自己的 `messageNamespace`，存储写入自己的 `ModuleStorage`；
- DOM 监听/定时器/AbortController 注册到 `ModuleScope`；
- 样式以 `[data-module-id="<module-id>"]` 为根选择器。
