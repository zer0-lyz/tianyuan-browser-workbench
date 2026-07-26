# 浏览器扩展模块化单体架构

日期：2026-07-26

状态：已接受，`0.11.0` 第一阶段落地

## 背景

侧栏功能增加到九个后，`sidepanel.js` 同时承担路由、DOM、状态、存储、消息和全部功能逻辑。继续直接追加功能会增加重复监听、共享状态污染和旧功能回归风险。

## 决策

浏览器扩展采用模块化单体架构：

```text
extension/src/
├── app/
│   └── legacy-feature-modules.js
├── core/
│   ├── event-bus.js
│   ├── feature-flags.js
│   ├── module-registry.js
│   ├── module-scope.js
│   └── module-storage.js
├── modules/
│   └── updates/
│       ├── module.js
│       ├── template.js
│       └── styles.css
└── sidepanel/
    └── sidepanel.js
```

模块在构建时注册，不从远端下载或执行代码。

## 模块契约

每个模块必须声明：

- 唯一 `id`；
- 唯一 `route`；
- `displayName`；
- `messageNamespace`；
- `stage`；
- 独立 `storageVersion`；
- 首页入口和页面挂载点；
- `initialize/activate/deactivate/dispose` 生命周期。

模块不能导入其他模块内部文件。跨模块协作只能使用公共接口或事件总线。

## 状态和资源隔离

- 模块状态键格式为 `tianyuanWorkbenchModule:<module-id>:v<version>`。
- 旧状态迁移只能在对应模块内部完成。
- DOM 监听、定时器、AbortController 和其他资源必须登记到 `ModuleScope`。
- 模块样式必须以 `[data-module-id="<module-id>"]` 为根选择器。
- 模块退出或扩展页面关闭时统一清理资源。

## 功能开关

- `stable`：默认启用。
- `beta`：只有本机显式启用后才初始化。
- `disabled`：入口、顶部控制和页面都不注册。

功能开关保存在 Chrome 本机存储，不从远端执行配置代码。

## 第一阶段范围

- 建立模块注册、生命周期、事件总线、独立存储和功能开关。
- 将“版本更新”完整迁移为独立模块。
- 其余八个模块通过兼容模块清单接入。
- 主侧栏不再包含 GitHub 更新业务逻辑。
- 公司和科目范围需求、页面挂载位置改由模块清单描述。

## 后续迁移顺序

1. 导出明细表、导出申报表；
2. 两个打印格式模块；
3. 批量保存、批量退出编辑；
4. 批量上传、批量清理附件。

上传和清理属于高风险线上写入功能，最后迁移，且迁移时不得改变既有保存、编辑锁和回读门禁。

## 回退

改造前基线：

`baseline-pre-modular-sidepanel-20260726`
