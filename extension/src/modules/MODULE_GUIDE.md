# 功能模块开发规则

天源浏览器工作台采用模块化单体架构。新功能优先新增独立模块，不直接把业务代码写入 `sidepanel.js`。

## 推荐结构

```text
modules/<module-id>/
├── module.js
├── template.js
├── styles.css
└── tests/
```

复杂模块可以继续增加：

```text
application/
domain/
infrastructure/
messages.js
state.js
```

## 模块清单

每个模块必须声明：

```js
export const exampleModule = {
  manifest: {
    id: "example",
    type: "feature",
    stage: "beta",
    route: "example",
    displayName: "示例功能",
    messageNamespace: "example",
    entryElementId: "openExample",
    pageElementId: "page-example",
    storageVersion: 1,
  },

  create() {
    return {
      async initialize(context) {},
      async activate() {},
      async deactivate() {},
      async dispose() {},
    };
  },
};
```

## 强制边界

- 模块不能导入另一个模块的内部文件。
- 模块只能通过 `context` 使用公共能力。
- 模块状态写入自己的 `ModuleStorage`，不能新增全局 Store 字段。
- 模块消息必须使用自己的 `messageNamespace`。
- DOM 监听、定时器和 AbortController 必须注册到 `ModuleScope`。
- 模块样式必须以 `[data-module-id="<module-id>"]` 为根选择器。
- 新模块默认使用 `stage: "beta"`，明确启用后才注册。
- 正式业务逻辑不能进入 `core/`。

## 公共层允许内容

- 模块注册和生命周期；
- 事件总线；
- 命名空间存储；
- 日志、错误和任务协议；
- 浏览器、Native Messaging 和权限能力接口。

公司、科目、底稿、附件和导出等具体业务逻辑必须留在对应功能模块内。

## 发布流程

1. 新建模块目录和模块清单。
2. 默认设为 `beta`。
3. 增加模块单元测试和旧功能回归测试。
4. 在本机启用并完成真实页面测试。
5. 改为 `stable` 后进入正式安装包。
6. 发现问题时通过功能开关禁用，不回退无关模块。
