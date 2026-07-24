(() => {
  const ADAPTER_VERSION = "2026-07-24-page-tree-mirror-v21-clear-audit-test-data";
  const REQUEST_TYPE = "TIANYUAN_WORKBENCH_GET_CONTEXT";
  const RESPONSE_TYPE = "TIANYUAN_WORKBENCH_CONTEXT_RESULT";
  const ACTION_REQUEST_TYPE = "TIANYUAN_WORKBENCH_RUN_ACTION";
  const ACTION_RESPONSE_TYPE = "TIANYUAN_WORKBENCH_ACTION_RESULT";
  const FIELD_TITLE = "查证资料索引";
  const MAX_HEADER_COLUMNS = 120;

  function textOf(element) {
    return (element?.innerText || element?.textContent || element?.value || element?.getAttribute?.("aria-label") || element?.title || "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isVisible(element) {
    return Boolean(element && (element.offsetWidth || element.offsetHeight || element.getClientRects().length));
  }

  function colName(index) {
    let n = index + 1;
    let s = "";
    while (n > 0) {
      const mod = (n - 1) % 26;
      s = String.fromCharCode(65 + mod) + s;
      n = Math.floor((n - 1) / 26);
    }
    return s;
  }

  function parseRoute() {
    const operationMatch = location.pathname.match(/\/ty\/operation\/([^/]+)/);
    const draftMatch = location.pathname.match(/\/ty\/operation\/([^/]+)\/([^/]+)\/asset-based-approach\/draft/);
    const params = new URLSearchParams(location.search);
    return {
      isTianyuanOperationRoute: Boolean(operationMatch),
      isEquityListRoute: /\/ty\/operation\/[^/]+\/equity\/list/.test(location.pathname),
      isAssetDraftRoute: Boolean(draftMatch),
      projectId: draftMatch?.[1] || operationMatch?.[1] || null,
      companyId: draftMatch?.[2] || null,
      subjectCode: params.get("subjectCode"),
    };
  }

  function getVisibleControls() {
    return [...document.querySelectorAll("button,.el-button,[role='button'],a,span,label")]
      .filter(isVisible)
      .map((element) => ({
        text: textOf(element),
        tag: element.tagName,
        disabled: Boolean(element.disabled || element.getAttribute("aria-disabled") === "true"),
        element,
      }))
      .filter((item) => item.text);
  }

  function serializeControl(item) {
    return {
      text: item.text,
      tag: item.tag,
      disabled: item.disabled,
    };
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function findVisibleElementByText(label, selector = "button,.el-button,[role='button'],a,span,label") {
    return [...document.querySelectorAll(selector)]
      .filter(isVisible)
      .find((element) => textOf(element) === label);
  }

  function findVisibleElementsByText(label, selector = "button,.el-button,[role='button'],a,span,label") {
    return [...document.querySelectorAll(selector)]
      .filter(isVisible)
      .filter((element) => textOf(element) === label);
  }

  function findVisibleElementByAnyText(labels, selector = "button,.el-button,[role='button'],a,span,label,div") {
    const normalized = labels.map((label) => String(label).trim()).filter(Boolean);
    return [...document.querySelectorAll(selector)]
      .filter(isVisible)
      .find((element) => {
        const text = textOf(element);
        if (!text || text.length > 80) return false;
        return normalized.some((label) => text === label || text.includes(label));
      });
  }

  function findLatestVisibleDialog() {
    const dialogs = [...document.querySelectorAll(".el-dialog,[role='dialog'],.el-popup-parent--hidden")]
      .filter(isVisible);
    return dialogs[dialogs.length - 1] || null;
  }

  function clickElement(element) {
    element.scrollIntoView?.({ block: "center", inline: "center" });
    element.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    element.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    element.click();
  }

  function findBodyHints() {
    const bodyText = document.body?.innerText || "";
    const lockMatch = bodyText.match(/.{0,20}编辑锁.{0,80}/);
    const permissionMatch = bodyText.match(/.{0,20}(无权限|权限不足|只读|不可编辑).{0,80}/);
    const loginLikely = /登录|Login/.test(bodyText) && !/资产基础法底稿/.test(bodyText);

    return {
      loginLikely,
      lockText: lockMatch?.[0]?.replace(/\s+/g, " ").trim() || null,
      permissionText: permissionMatch?.[0]?.replace(/\s+/g, " ").trim() || null,
    };
  }

  function getSpreadContext() {
    const host = document.querySelector(".spreadWrapper");
    const spread = window.GC?.Spread?.Sheets?.findControl?.(host);
    if (!host || !spread) {
      return {
        found: false,
        reason: host ? "SPREAD_CONTROL_NOT_READY" : "SPREAD_WRAPPER_NOT_FOUND",
      };
    }

    const sheet = spread.getActiveSheet?.();
    if (!sheet) {
      return {
        found: false,
        reason: "ACTIVE_SHEET_NOT_FOUND",
      };
    }

    const sheetCount = Number(spread.getSheetCount?.() || 0);
    const sheetNames = [];
    for (let i = 0; i < Math.min(sheetCount, 80); i += 1) {
      const candidate = spread.getSheet?.(i);
      if (candidate?.name) {
        sheetNames.push({
          index: i,
          name: candidate.name(),
          visible: candidate.visible?.() !== false,
        });
      }
    }

    const columnCount = Number(sheet.getColumnCount?.() || 0);
    const rowCount = Number(sheet.getRowCount?.() || 0);
    const activeRow = Number(sheet.getActiveRowIndex?.());
    const activeCol = Number(sheet.getActiveColumnIndex?.());
    const safeActiveRow = Number.isFinite(activeRow) && activeRow >= 0 ? activeRow : null;
    const safeActiveCol = Number.isFinite(activeCol) && activeCol >= 0 ? activeCol : null;

    const headers = [];
    const cappedColumnCount = Math.min(columnCount, MAX_HEADER_COLUMNS);
    let fieldColumn = -1;

    for (let col = 0; col < cappedColumnCount; col += 1) {
      const title = String(sheet.getText?.(0, col) || sheet.getValue?.(0, col) || "").trim();
      headers.push({ col, name: colName(col), title });
      if (title === FIELD_TITLE) fieldColumn = col;
    }

    const targetRow = safeActiveRow === null || safeActiveRow < 1 ? 1 : safeActiveRow;
    const activeCell = safeActiveRow === null || safeActiveCol === null
      ? null
      : {
          row: safeActiveRow,
          col: safeActiveCol,
          address: `${colName(safeActiveCol)}${safeActiveRow + 1}`,
          text: sheet.getText?.(safeActiveRow, safeActiveCol) ?? null,
          value: sheet.getValue?.(safeActiveRow, safeActiveCol) ?? null,
        };

    let auditField = {
      title: FIELD_TITLE,
      found: fieldColumn >= 0,
      col: fieldColumn >= 0 ? fieldColumn : null,
      columnName: fieldColumn >= 0 ? colName(fieldColumn) : null,
      targetRow,
      targetAddress: fieldColumn >= 0 ? `${colName(fieldColumn)}${targetRow + 1}` : null,
    };

    if (fieldColumn >= 0) {
      const cellType = sheet.getCellType?.(targetRow, fieldColumn);
      auditField = {
        ...auditField,
        text: sheet.getText?.(targetRow, fieldColumn) ?? null,
        value: sheet.getValue?.(targetRow, fieldColumn) ?? null,
        tag: sheet.getTag?.(targetRow, fieldColumn) ?? null,
        cellType: cellType
          ? {
              constructorName: cellType.constructor?.name || null,
              domId: cellType.domId || null,
              isReadOnly: Boolean(cellType.isReadOnly),
              hasActivateEditor: typeof cellType.activateEditor === "function",
              isOperationUploadCell: cellType.domId === "operation-upload-cell",
            }
          : null,
      };
    }

    return {
      found: true,
      sheetName: sheet.name?.() || null,
      sheetNames,
      rowCount,
      columnCount,
      activeCell,
      headers,
      headersTruncated: columnCount > MAX_HEADER_COLUMNS,
      auditField,
    };
  }

  function collectVisibleSubjects(route, spread) {
    const subjects = [];
    const seen = new Set();

    function addSubject(subject) {
      const code = String(subject.subjectCode || "").trim();
      const key = `${code}|${subject.name || ""}`;
      if (!code || seen.has(key)) return;
      seen.add(key);
      subjects.push(subject);
    }

    if (route.subjectCode) {
      addSubject({
        subjectCode: route.subjectCode,
        name: spread?.sheetName || route.subjectCode,
        source: "current-url",
        active: true,
      });
    }

    const bodyText = document.body?.innerText || "";
    const codeMatches = bodyText.match(/\b[A-Z]\d+(?:-\d+){0,4}\b/g) || [];
    for (const code of codeMatches.slice(0, 80)) {
      addSubject({
        subjectCode: code,
        name: code,
        source: "visible-text",
        active: code === route.subjectCode,
      });
    }

    return subjects;
  }

  function collectSubjectTreeItems() {
    const subjectTreeSelectors = [".el-tree", "[role='tree']", ".subject-tree"];
    const activeText = textOf(document.querySelector(".is-current,.is-active,.el-tree-node.is-current,.el-tree-node__content.is-current"));
    const subjectNamePattern = /(资产|负债|权益|货币|银行|应收|应付|预付|预收|票据|账款|存货|借款|合同|税费|长期|短期|固定|无形|递延|资本|公积|利润|费用|收入|成本|工程|设备|房屋|土地|车辆|电子|办公|其他|一年内|流动|非流动)/;
    const excludedText = new Set([
      "阶段",
      "开始",
      "公式",
      "视图",
      "评估作业",
      "导入数据",
      "导出底稿",
      "科目通用文件",
      "汇率填充",
      "科目重分类",
      "科目重命名",
      "二级表",
      "关联数据同步",
      "显示/隐藏",
      "跳转汇总表",
      "保存",
      "刷新",
      "退出编辑",
    ]);
    const rootContainers = subjectTreeSelectors
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter(isVisible);

    const structuredItems = [];
    const seen = new Set();

    function pushItem(text, depth, leaf, element, pathKey = "", pathTexts = [], subjectCode = "") {
      const cleanedText = String(text || "").trim();
      if (!cleanedText || cleanedText.length > 40 || /[：:]/.test(cleanedText)) return;
      if (excludedText.has(cleanedText)) return;
      if (!subjectNamePattern.test(cleanedText)) return;
      const key = pathKey || `${cleanedText}|${depth}|${leaf ? 1 : 0}`;
      if (seen.has(key)) return;
      seen.add(key);
      structuredItems.push({
        text: cleanedText,
        active: Boolean(
          element?.closest?.(".is-current,.is-active") ||
          element?.classList?.contains("is-current") ||
          element?.classList?.contains("is-active") ||
          (activeText && cleanedText === activeText)
        ),
        left: Number.isFinite(element?.getBoundingClientRect?.().left) ? Math.round(element.getBoundingClientRect().left) : 0,
        depth,
        leaf,
        path: pathTexts.join("/"),
        subjectCode: /^C\d+(?:-\d+)*$/.test(subjectCode) ? subjectCode : "",
      });
    }

    function readNodeText(nodeElement, content, label, component) {
      const data = component?.node?.data || component?.node?.raw || component?.data || {};
      const candidates = [
        data.subjectName,
        data.subject_name,
        data.name,
        data.label,
        data.text,
        data.title,
        data.accountName,
        data.account_name,
        content ? textOf(content) : "",
        label ? textOf(label) : "",
        textOf(nodeElement),
      ];
      return candidates.map((value) => String(value || "").trim()).find(Boolean) || "";
    }

    function readNodeCode(nodeElement, component) {
      const data = component?.node?.data || component?.node?.raw || component?.data || {};
      const candidates = [
        data.subjectCode,
        data.subject_code,
        data.assetSubjectCode,
        data.asset_subject_code,
        data.accountCode,
        data.account_code,
        data.code,
        data.value,
        data.id,
        data.key,
        data.route?.query?.subjectCode,
        data.query?.subjectCode,
        component?.node?.key,
        nodeElement?.getAttribute?.("data-subject-code"),
        nodeElement?.getAttribute?.("data-code"),
        nodeElement?.getAttribute?.("node-key"),
        nodeElement?.querySelector?.('a[href*="subjectCode="]')?.getAttribute?.("href"),
      ];
      for (const value of candidates) {
        const match = String(value || "").match(/\bC\d+(?:-\d+)*\b/);
        if (match) return match[0];
      }
      return "";
    }

  function arrayFromTreeChildren(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value[Symbol.iterator] === "function") return [...value];
    if (typeof value === "object") return Object.values(value).filter(Boolean);
    return [];
  }

    function walkNode(nodeElement, depth = 0, pathKey = "", pathTexts = []) {
      if (!nodeElement || !isVisible(nodeElement)) return;
      const component = nodeElement.__vue__ || nodeElement.__vueParentComponent?.proxy || null;
      const content = nodeElement.querySelector?.(":scope > .el-tree-node__content") || nodeElement.querySelector?.(".el-tree-node__content");
      const label = content?.querySelector?.(".el-tree-node__label")
        || nodeElement.querySelector?.(":scope > .el-tree-node__content .el-tree-node__label")
        || nodeElement.querySelector?.(".el-tree-node__content .el-tree-node__label");
      const text = readNodeText(nodeElement, content, label, component);
      const childContainer = nodeElement.querySelector?.(":scope > .el-tree-node__children") || nodeElement.querySelector?.(".el-tree-node__children");
      const childNodes = childContainer ? [...childContainer.children].filter((child) => child.classList?.contains("el-tree-node")) : [];
      const componentChildren = arrayFromTreeChildren(component?.node?.childNodes || component?.childNodes).filter(Boolean);
      const leaf = !childNodes.length && !componentChildren.length
        || Boolean(content?.classList?.contains("is-leaf"))
        || Boolean(component?.node?.isLeaf)
        || Boolean(component?.data?.isLeaf);
      pushItem(text, depth, leaf, content || label || nodeElement, pathKey, pathTexts, readNodeCode(nodeElement, component));
      const nextChildren = childNodes.length ? childNodes : componentChildren.map((child) => child?.$el || child?.el || child?.vnode?.el).filter(Boolean);
      const nextPathTexts = text ? [...pathTexts, text] : pathTexts;
      for (const [index, child] of nextChildren.entries()) {
        walkNode(child, depth + 1, `${pathKey}.${index}`, nextPathTexts);
      }
    }

    for (const [containerIndex, container] of rootContainers.entries()) {
      const rootNodes = [...container.children].filter((child) => child.classList?.contains("el-tree-node"));
      if (!rootNodes.length) continue;
      for (const [index, rootNode] of rootNodes.entries()) {
        walkNode(rootNode, 0, `${containerIndex}.${index}`);
      }
    }

    if (structuredItems.length) {
      return structuredItems;
    }

    const candidates = [...document.querySelectorAll(".el-tree-node__content, .el-tree-node__label, [role='treeitem'], li, .subject-tree span, span, div")]
      .filter(isVisible)
      .map((element) => {
        const text = textOf(element);
        const rect = element.getBoundingClientRect();
        const active = Boolean(
          element.closest(".is-current,.is-active") ||
          element.classList.contains("is-current") ||
          element.classList.contains("is-active") ||
          (activeText && text === activeText)
        );
        return { text, active, left: Math.round(rect.left) };
      })
      .filter((item) => {
        if (!item.text || item.text.length > 40 || /[：:]/.test(item.text)) return false;
        if (excludedText.has(item.text)) return false;
        if (item.left > 360) return false;
        return subjectNamePattern.test(item.text);
      });

    const fallbackSeen = new Set();
    const unique = candidates
      .filter((item) => {
        const key = `${item.text}|${item.left}`;
        if (fallbackSeen.has(key)) return false;
        fallbackSeen.add(key);
        return true;
      })
      .slice(0, 120);
    const leftLevels = [...new Set(unique.map((item) => item.left))]
      .sort((a, b) => a - b);
    return unique.map((item, index) => {
      const next = unique[index + 1];
      const depth = Math.max(0, leftLevels.findIndex((left) => left === item.left));
      return {
        ...item,
        depth,
        leaf: !(next && next.left > item.left),
      };
    });
  }

  function isScrollableElement(element) {
    if (!element || !isVisible(element)) return false;
    const style = window.getComputedStyle?.(element);
    if (!style) return false;
    const overflowY = String(style.overflowY || style.overflow || "").toLowerCase();
    return (element.scrollHeight - element.clientHeight) > 4 && !["visible", "clip"].includes(overflowY);
  }

  function getTreeScrollTargets(rootContainers) {
    const targets = [];
    const seen = new Set();

    for (const container of rootContainers) {
      let current = container;
      while (current && current !== document.body) {
        if (isScrollableElement(current)) {
          const key = current === document.documentElement ? "documentElement" : current;
          if (!seen.has(key)) {
            seen.add(key);
            targets.push(current);
          }
          break;
        }
        current = current.parentElement;
      }
    }

    return targets;
  }

  async function expandSubjectTreeForCollection() {
    let clicked = 0;
    for (let round = 0; round < 10; round += 1) {
      const toggles = [...document.querySelectorAll(".el-tree-node__expand-icon,[class*='tree-node'][class*='expand'],[role='treeitem'] .el-icon-caret-right")]
        .filter(isVisible)
        .filter((element) => {
          const rect = element.getBoundingClientRect();
          if (rect.left > 340) return false;
          const className = String(element.className || "");
          if (/is-leaf|expanded/.test(className)) return false;
          const node = element.closest?.(".el-tree-node,[role='treeitem'],li");
          const nodeText = textOf(node);
          if (!nodeText || nodeText.length > 120) return false;
          return /(资产|负债|权益|货币|长期|短期|应收|应付|存货|金融|现金|银行|其他|股权|薪酬)/.test(nodeText);
        });
      if (!toggles.length) break;
      for (const toggle of toggles.slice(0, 40)) {
        clickElement(toggle);
        clicked += 1;
        await sleep(80);
      }
      await sleep(300);
    }
    return clicked;
  }

  async function listAssetDraftSubjects() {
    const before = collectSubjectTreeItems();
    const clicked = await expandSubjectTreeForCollection();
    const after = await collectSubjectTreeItemsByScrolling();
    return {
      ok: true,
      action: "list_asset_draft_subjects",
      collectedAt: new Date().toISOString(),
      url: location.href,
      subjects: after,
      expanded: clicked > 0,
      expandedClickCount: clicked,
      beforeCount: before.length,
    };
  }

  async function collectSubjectTreeItemsByScrolling() {
    const baseItems = collectSubjectTreeItems();
    const rootContainers = [".el-tree", "[role='tree']", ".subject-tree"]
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter(isVisible);
    const scrollTargets = getTreeScrollTargets(rootContainers);

    if (!scrollTargets.length) {
      return baseItems;
    }

    const merged = [...baseItems];
    const seen = new Set(baseItems.map((item) => `${item.path || ""}|${item.text}|${item.depth}|${item.leaf ? 1 : 0}`));

    function mergeItems(items) {
      for (const item of items) {
        const key = `${item.path || ""}|${item.text}|${item.depth}|${item.leaf ? 1 : 0}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(item);
      }
    }

    for (const target of scrollTargets) {
      const originalTop = target.scrollTop;
      let lastTop = -1;
      let stuckCount = 0;

      for (let round = 0; round < 30; round += 1) {
        mergeItems(collectSubjectTreeItems());
        const maxTop = Math.max(0, target.scrollHeight - target.clientHeight);
        if (target.scrollTop >= maxTop - 2) break;

        const nextTop = Math.min(maxTop, target.scrollTop + Math.max(120, Math.floor(target.clientHeight * 0.8)));
        if (nextTop === target.scrollTop || nextTop === lastTop) {
          stuckCount += 1;
          if (stuckCount >= 2) break;
        } else {
          stuckCount = 0;
        }
        lastTop = target.scrollTop;
        target.scrollTop = nextTop;
        target.dispatchEvent(new Event("scroll", { bubbles: true }));
        await sleep(160);
      }

      mergeItems(collectSubjectTreeItems());
      target.scrollTop = originalTop;
      target.dispatchEvent(new Event("scroll", { bubbles: true }));
      await sleep(80);
    }

    return merged;
  }

  function collectContext(options = {}) {
    const route = parseRoute();
    const controls = getVisibleControls();
    const saveButtons = controls.filter((item) => item.text === "保存");
    const bodyHints = findBodyHints();
    const spread = getSpreadContext();
    const includeTree = Boolean(options.includeSubjectTree);

    return {
      ok: true,
      collectedAt: new Date().toISOString(),
      url: location.href,
      title: document.title,
      route,
      page: {
        hasAssetDraftText: (document.body?.innerText || "").includes("资产基础法底稿"),
        saveButton: {
          visible: saveButtons.length > 0,
          count: saveButtons.length,
          disabled: saveButtons.every((button) => button.disabled),
        },
        ...bodyHints,
      },
      spread,
      subjects: collectVisibleSubjects(route, spread),
      subjectTree: includeTree ? collectSubjectTreeItems() : [],
      controlsPreview: controls.slice(0, 24).map(serializeControl),
      security: {
        readOnlyContext: true,
        fixedWriteActionsEnabled: true,
        writesPerformed: false,
        credentialsCaptured: false,
      },
    };
  }

  function closeDialogWithoutConfirm() {
    const dialog = findLatestVisibleDialog();
    const cancel = findVisibleElementByText("取消", "button,.el-button");
    if (cancel) {
      clickElement(cancel);
      return { closedBy: "cancel" };
    }
    const close = dialog?.querySelector?.(".el-dialog__headerbtn,.el-dialog__close,[aria-label='Close']");
    if (close) {
      clickElement(close);
      return { closedBy: "close_button" };
    }
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return { closedBy: "escape" };
  }

  async function listCompaniesFromSelector() {
    const context = collectContext();
    const gate = assertDraftPage(context);
    const result = {
      ok: gate.ok,
      action: "list_asset_draft_companies",
      collectedAt: new Date().toISOString(),
      url: location.href,
      gate,
      companies: [],
      security: {
        credentialsCaptured: false,
        uploadPerformed: false,
        writesPerformed: false,
      },
    };

    if (!gate.ok) return result;

    const more = findVisibleElementByAnyText(["选择更多", "公司主体", "公司列表", "股权结构"], "button,.el-button,[role='button'],a,span,div");
    if (!more) {
      return {
        ...result,
        ok: false,
        reason: "CHOOSE_MORE_NOT_FOUND",
        visibleControls: getVisibleControls().slice(0, 100).map(serializeControl),
      };
    }

    clickElement(more);
    await sleep(900);

    const dialog = findLatestVisibleDialog() || document.body;
    const labelNodes = [...dialog.querySelectorAll(".el-checkbox__label")];
    const rawSource = labelNodes.length ? labelNodes : [...dialog.querySelectorAll(".el-checkbox,label,tr,li")];
    const rawItems = rawSource
      .filter(isVisible)
      .map((element) => {
        const text = textOf(element);
        const box = element.closest?.(".el-checkbox") || element;
        const input = box.querySelector?.("input[type='checkbox']");
        const checked = Boolean(input?.checked || box.classList?.contains("is-checked") || box.querySelector?.(".is-checked"));
        const attrs = readElementDataset(element);
        const attrText = Object.values(attrs).join(" ");
        const code = pickCompanyCodeFromText(`${attrText} ${element.getAttribute?.("title") || ""} ${element.getAttribute?.("aria-label") || ""} ${text}`);
        return { text, checked, code, attrs };
      })
      .filter((item) => item.text && item.text.length <= 80 && !["全选", "全不选", "确定", "取消", "交叉关联"].includes(item.text));

    const seen = new Set();
    result.companies = rawItems
      .filter((item) => {
        if (seen.has(item.text)) return false;
        seen.add(item.text);
        return true;
      })
      .map((item, index) => ({
        id: String(index + 1),
        label: item.text,
        code: item.code || "",
        selected: item.checked,
        raw: { attrs: item.attrs },
      }));
    result.dialogText = textOf(dialog).slice(0, 1500);
    result.close = closeDialogWithoutConfirm();
    await sleep(300);
    result.ok = true;
    return result;
  }

  async function openCompanySelector() {
    const context = collectContext();
    const gate = assertDraftPage(context);
    const result = {
      ok: gate.ok,
      action: "open_company_selector",
      collectedAt: new Date().toISOString(),
      url: location.href,
      gate,
    };

    if (!gate.ok) return result;

    const more = findVisibleElementByAnyText(["选择更多", "公司主体", "公司列表", "股权结构"], "button,.el-button,[role='button'],a,span,div");
    if (!more) {
      return {
        ...result,
        ok: false,
        reason: "CHOOSE_MORE_NOT_FOUND",
        visibleControls: getVisibleControls().slice(0, 100).map(serializeControl),
      };
    }

    clickElement(more);
    await sleep(800);
    result.dialogText = textOf(findLatestVisibleDialog()).slice(0, 1500);
    result.ok = true;
    return result;
  }

  async function readSelectedCompaniesFromOpenDialog({ confirm = false } = {}) {
    const dialog = findLatestVisibleDialog();
    const result = {
      ok: Boolean(dialog),
      action: "read_selected_companies",
      collectedAt: new Date().toISOString(),
      url: location.href,
      companies: [],
      confirmed: false,
      security: {
        credentialsCaptured: false,
        uploadPerformed: false,
        writesPerformed: false,
      },
    };

    if (!dialog) {
      return { ...result, reason: "COMPANY_DIALOG_NOT_OPEN" };
    }

    const items = [...dialog.querySelectorAll(".el-checkbox,label,tr,li")]
      .filter(isVisible)
      .map((element) => {
        const text = textOf(element);
        const input = element.querySelector?.("input[type='checkbox']");
        const checked = Boolean(input?.checked || element.classList?.contains("is-checked") || element.querySelector?.(".is-checked"));
        return { text, checked };
      })
      .filter((item) => item.text && !["全选", "全不选", "确定", "取消"].includes(item.text));

    const seen = new Set();
    result.companies = items
      .filter((item) => {
        if (seen.has(item.text)) return false;
        seen.add(item.text);
        return true;
      })
      .map((item, index) => ({
        id: String(index + 1),
        label: item.text,
        selected: item.checked,
      }));
    result.dialogText = textOf(dialog).slice(0, 1500);

    if (confirm) {
      const okButton = findVisibleElementByText("确定", "button,.el-button");
      if (!okButton) {
        return { ...result, ok: false, reason: "CONFIRM_BUTTON_NOT_FOUND" };
      }
      clickElement(okButton);
      await sleep(800);
      result.confirmed = true;
      result.security.writesPerformed = true;
    }

    return result;
  }

  function readCellText(cell) {
    const inner = cell?.querySelector?.(".cell") || cell;
    return (
      inner?.getAttribute?.("title") ||
      inner?.innerText ||
      inner?.textContent ||
      ""
    ).replace(/\s+/g, " ").trim();
  }

  function readElementDataset(element) {
    const result = {};
    for (const node of [element, element?.parentElement, element?.closest?.(".el-checkbox,.el-tree-node,tr,li")].filter(Boolean)) {
      for (const attr of node.getAttributeNames?.() || []) {
        if (/code|编码|no|seq|index|sort|level|tree/i.test(attr)) {
          result[attr] = node.getAttribute(attr);
        }
      }
    }
    return result;
  }

  function pickCompanyCodeFromText(text) {
    const clean = String(text || "").replace(/\s+/g, " ").trim();
    const match = clean.match(/(?:^|[^\d])([1-9]\d{0,1}(?:-\d{1,2}){0,6})(?=\s|[^\d]|$)/);
    return match?.[1] || "";
  }

  function findHeaderIndex(headers, labels) {
    return headers.findIndex((header) => labels.some((label) => header === label || header.includes(label)));
  }

  async function listEquityTableCompanies() {
    const result = {
      ok: true,
      action: "list_equity_table_companies",
      collectedAt: new Date().toISOString(),
      url: location.href,
      companies: [],
      security: {
        credentialsCaptured: false,
        uploadPerformed: false,
        writesPerformed: false,
      },
    };

    function isInFixedTable(node) {
      return Boolean(node?.closest?.(".el-table__fixed,.el-table__fixed-left,.el-table__fixed-right"));
    }

    function scopedElements(container, selector, options = {}) {
      return [...container.querySelectorAll(selector)]
        .filter((node) => !options.excludeFixed || !isInFixedTable(node));
    }

    function collectTableHeaders(container, options = {}) {
      return scopedElements(container, ".el-table__header-wrapper th,thead th", options)
        .map(readCellText)
        .filter(Boolean);
    }

    function collectTableRows(container, options = {}) {
      return scopedElements(container, ".el-table__body-wrapper tbody tr,tbody tr", options)
        .filter(isVisible)
        .map((row) => [...row.querySelectorAll("td")].map(readCellText));
    }

    function rowsFromSingleTable(table) {
      const headers = collectTableHeaders(table, { excludeFixed: true });
      const codeIndex = findHeaderIndex(headers, ["编码", "公司编号", "层级编码", "序号"]);
      const nameIndex = findHeaderIndex(headers, ["公司名称", "企业名称"]);
      const shortNameIndex = findHeaderIndex(headers, ["公司简称", "简称"]);
      const parentIndex = findHeaderIndex(headers, ["上级母公司", "上级公司", "母公司"]);
      if (codeIndex < 0 || (nameIndex < 0 && shortNameIndex < 0)) return [];

      return collectTableRows(table, { excludeFixed: true }).map((cells) => ({
        code: cells[codeIndex] || "",
        name: nameIndex >= 0 ? cells[nameIndex] || "" : "",
        shortName: shortNameIndex >= 0 ? cells[shortNameIndex] || "" : "",
        parentName: parentIndex >= 0 ? cells[parentIndex] || "" : "",
        raw: { cells, headers },
        source: "equity-table",
      })).filter((item) => item.code && (item.name || item.shortName));
    }

    function rowsFromSplitElementTable(table) {
      const fixedTables = [...table.querySelectorAll(".el-table__fixed,.el-table__fixed-left,.el-table__fixed-right")]
        .filter(isVisible);

      const codeSource = fixedTables.find((node) => collectTableHeaders(node).some((header) => /编码|公司编号|层级编码|序号/.test(header)));
      const detailSource = table;
      if (!codeSource) return [];

      const codeHeaders = collectTableHeaders(codeSource);
      const detailHeaders = collectTableHeaders(detailSource, { excludeFixed: true });
      const codeIndex = findHeaderIndex(codeHeaders, ["编码", "公司编号", "层级编码", "序号"]);
      const nameIndex = findHeaderIndex(detailHeaders, ["公司名称", "企业名称"]);
      const shortNameIndex = findHeaderIndex(detailHeaders, ["公司简称", "简称"]);
      const parentIndex = findHeaderIndex(detailHeaders, ["上级母公司", "上级公司", "母公司"]);
      if (codeIndex < 0 || (nameIndex < 0 && shortNameIndex < 0)) return [];

      const codeRows = collectTableRows(codeSource);
      const detailRows = collectTableRows(detailSource, { excludeFixed: true }).filter((cells) => cells.length >= Math.min(detailHeaders.length, 1));
      return detailRows.map((cells, index) => ({
        code: codeRows[index]?.[codeIndex] || "",
        name: nameIndex >= 0 ? cells[nameIndex] || "" : "",
        shortName: shortNameIndex >= 0 ? cells[shortNameIndex] || "" : "",
        parentName: parentIndex >= 0 ? cells[parentIndex] || "" : "",
        raw: { cells, codeCells: codeRows[index] || [], headers: detailHeaders, codeHeaders },
        source: "equity-table-split",
      })).filter((item) => item.code && (item.name || item.shortName));
    }

    function rowsFromLooseTable(table) {
      return collectTableRows(table)
        .map((cells) => {
          const cleanCells = cells.map((cell) => String(cell || "").trim()).filter(Boolean);
          const code = cleanCells.map(pickCompanyCodeFromText).find(Boolean) || "";
          if (!code) return null;
          const names = cleanCells.filter((cell) => cell !== code && /[\u4e00-\u9fa5]/.test(cell));
          const preferredName = names.find((cell) => /公司|芯|科|光电|半导体|智算|扶摇|力通|迪吉/.test(cell)) || names[0] || "";
          return {
            code,
            name: preferredName,
            shortName: preferredName,
            parentName: "",
            raw: { cells, headers: collectTableHeaders(table) },
            source: "equity-table-loose",
          };
        })
        .filter((item) => item?.code && (item.name || item.shortName));
    }

    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (document.querySelector(".el-table__body-wrapper tbody tr,tbody tr")) break;
      await sleep(300);
    }

    const tables = [...document.querySelectorAll(".el-table,table")].filter(isVisible);
    result.tableDiagnostics = tables.slice(0, 8).map((table, index) => ({
      index,
      className: table.className || "",
      headers: collectTableHeaders(table).slice(0, 30),
      headersWithoutFixed: collectTableHeaders(table, { excludeFixed: true }).slice(0, 30),
      fixedHeaders: [...table.querySelectorAll(".el-table__fixed,.el-table__fixed-left,.el-table__fixed-right")]
        .filter(isVisible)
        .map((node) => collectTableHeaders(node).slice(0, 30)),
      rowCount: collectTableRows(table).length,
      rowCountWithoutFixed: collectTableRows(table, { excludeFixed: true }).length,
    }));
    for (const table of tables) {
      result.companies = rowsFromSingleTable(table);
      if (!result.companies.length) result.companies = rowsFromSplitElementTable(table);
      if (!result.companies.length) result.companies = rowsFromLooseTable(table);

      if (result.companies.length) {
        result.headers = result.companies[0]?.raw?.headers || [];
        result.codeHeaders = result.companies[0]?.raw?.codeHeaders || [];
        break;
      }
    }

    if (!result.companies.length) {
      result.ok = false;
      result.reason = "EQUITY_TABLE_COMPANIES_NOT_FOUND";
      result.title = document.title;
      result.route = parseRoute();
      result.controlsPreview = getVisibleControls().slice(0, 80).map(serializeControl);
    }
    return result;
  }

  function assertDraftPage(context) {
    if (!context.route?.isAssetDraftRoute) {
      return { ok: false, reason: "NOT_ASSET_DRAFT_ROUTE" };
    }
    if (!context.page?.hasAssetDraftText) {
      return { ok: false, reason: "ASSET_DRAFT_TEXT_NOT_FOUND" };
    }
    if (!context.page?.saveButton?.visible) {
      return { ok: false, reason: "SAVE_BUTTON_NOT_FOUND" };
    }
    if (context.page.loginLikely) {
      return { ok: false, reason: "LOGIN_REQUIRED" };
    }
    return { ok: true };
  }

  function readDialogCompanyItems(dialog) {
    const primary = [...dialog.querySelectorAll(".el-checkbox,label")].filter(isVisible);
    const source = primary.length ? primary : [...dialog.querySelectorAll("tr,li")].filter(isVisible);
    const seen = new Set();
    return source
      .filter(isVisible)
      .map((element) => {
        const text = textOf(element);
        const box = element.closest?.(".el-checkbox") || element;
        const input = box.querySelector?.("input[type='checkbox']");
        const checked = Boolean(input?.checked || box.classList?.contains("is-checked") || box.querySelector?.(".is-checked"));
        const attrs = readElementDataset(element);
        const attrText = Object.values(attrs).join(" ");
        const title = element.getAttribute?.("title") || "";
        const ariaLabel = element.getAttribute?.("aria-label") || "";
        const code = pickCompanyCodeFromText(`${attrText} ${title} ${ariaLabel} ${text}`);
        return { element, box, input, text, checked, attrs, code };
      })
      .filter((item) => item.text && item.text.length <= 120 && !["全选", "全不选", "确定", "取消", "交叉关联"].includes(item.text))
      .filter((item) => {
        const key = item.input || item.box || item.element;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
  }

  function normalizeMatchText(value) {
    return String(value || "")
      .replace(/[（(].*?[）)]/g, "")
      .replace(/有限公司|有限责任公司|股份有限公司|科技发展|科技|公司|\s|\.{3}|…/g, "")
      .trim();
  }

  function companySelectionTokens(company) {
    if (typeof company === "string") return [company].map(String).filter(Boolean);
    if (!company || typeof company !== "object") return [];
    return [
      company.code,
      company.shortName,
      company.name,
      company.title,
      company.id,
      company.value,
    ].map((value) => String(value || "").trim()).filter(Boolean);
  }

  function companyItemMatchesSelection(item, selection) {
    const tokens = companySelectionTokens(selection);
    const itemText = String(item.text || "").trim();
    const itemNormalized = normalizeMatchText(itemText);
    const itemAttrText = Object.values(item.attrs || {}).join(" ");
    return tokens.some((token) => {
      if (!token) return false;
      if (item.code && token === item.code) return true;
      if (itemText === token || itemText.includes(token)) return true;
      if (itemAttrText.includes(token)) return true;
      const normalized = normalizeMatchText(token);
      return normalized && (itemNormalized === normalized || itemNormalized.includes(normalized) || normalized.includes(itemNormalized));
    });
  }

  async function selectCompanyScope(scope, filters, selectedCompanies = []) {
    if (scope === "current") {
      return {
        ok: true,
        scope,
        action: "kept_current_company_scope",
      };
    }

    const more = findVisibleElementByText("选择更多");
    if (!more) {
      return {
        ok: false,
        scope,
        reason: "CHOOSE_MORE_NOT_FOUND",
        visibleControls: getVisibleControls().slice(0, 100).map(serializeControl),
      };
    }

    clickElement(more);
    await sleep(800);

    if (scope === "all") {
      const selectAll = findVisibleElementByText("全选");
      if (!selectAll) {
        return {
          ok: false,
          scope,
          reason: "SELECT_ALL_NOT_FOUND",
          dialogText: textOf(findLatestVisibleDialog()).slice(0, 1500),
        };
      }
      clickElement(selectAll);
      await sleep(500);
    } else if (scope === "partial") {
      const selections = (selectedCompanies || []).length
        ? selectedCompanies
        : (filters || []).map((item) => String(item).trim()).filter(Boolean);
      if (!selections.length) {
        return { ok: false, scope, reason: "PARTIAL_FILTERS_EMPTY" };
      }

      const clearButtons = ["清空", "取消全选", "重置"]
        .map((label) => findVisibleElementByText(label))
        .filter(Boolean);
      if (clearButtons[0]) {
        clickElement(clearButtons[0]);
        await sleep(300);
      }

      const dialog = findLatestVisibleDialog() || document.body;

      const clicked = [];
      const missing = [];
      for (const selection of selections) {
        const candidates = readDialogCompanyItems(dialog);
        const match = candidates.find((item) => companyItemMatchesSelection(item, selection));
        if (!match) {
          missing.push(selection);
          continue;
        }
        if (!match.checked) {
          const checkbox = match.input || match.box || match.element.closest?.("label") || match.element;
          clickElement(checkbox);
          await sleep(150);
        }
        clicked.push({
          text: match.text.slice(0, 120),
          code: match.code || "",
          expected: companySelectionTokens(selection).slice(0, 4),
        });
      }

      if (missing.length) {
        return {
          ok: false,
          scope,
          reason: "PARTIAL_COMPANY_NOT_FOUND",
          missing: missing.map((item) => companySelectionTokens(item).slice(0, 4)),
          selected: clicked,
          dialogText: textOf(dialog).slice(0, 1500),
        };
      }

      let candidates = readDialogCompanyItems(dialog);
      for (const item of candidates) {
        const shouldBeChecked = selections.some((selection) => companyItemMatchesSelection(item, selection));
        if (item.checked !== shouldBeChecked) {
          const checkbox = item.input || item.box || item.element.closest?.("label") || item.element;
          clickElement(checkbox);
          await sleep(120);
        }
      }

      const selectedAfter = readDialogCompanyItems(dialog)
        .filter((item) => item.checked)
        .map((item) => ({ text: item.text.slice(0, 120), code: item.code || "" }));
      const missingAfter = selections.filter((selection) => !selectedAfter.some((item) => companyItemMatchesSelection(item, selection)));
      const extraAfter = selectedAfter.filter((item) => !selections.some((selection) => companyItemMatchesSelection(item, selection)));
      if (missingAfter.length || extraAfter.length) {
        return {
          ok: false,
          scope,
          reason: "ACTUAL_COMPANY_SELECTION_MISMATCH",
          selected: clicked,
          selectedAfter,
          missingAfter: missingAfter.map((item) => companySelectionTokens(item).slice(0, 4)),
          extraAfter,
          dialogText: textOf(dialog).slice(0, 1500),
        };
      }

      return await confirmCompanySelection({ scope, selected: clicked, selectedAfter });
    }

    return await confirmCompanySelection({ scope });
  }

  async function confirmCompanySelection(extra = {}) {
    const okButton = findVisibleElementByText("确定");
    if (!okButton) {
      return {
        ok: false,
        ...extra,
        reason: "CONFIRM_BUTTON_NOT_FOUND",
        dialogText: textOf(findLatestVisibleDialog()).slice(0, 1500),
      };
    }

    clickElement(okButton);
    await sleep(1000);
    return {
      ok: true,
      ...extra,
      action: "company_scope_confirmed",
    };
  }

  function getPageMessages() {
    return [...document.querySelectorAll(".el-message,.el-notification,.el-message-box,.el-dialog")]
      .filter(isVisible)
      .map((element) => textOf(element))
      .filter(Boolean)
      .slice(-10);
  }

  function installUploadNetworkMonitor() {
    if (window.__tianyuanWorkbenchUploadNetworkPatched) return;
    window.__tianyuanWorkbenchUploadNetworkPatched = true;
    window.__tianyuanWorkbenchUploadNetworkLog = [];

    const push = (item) => {
      try {
        window.__tianyuanWorkbenchUploadNetworkLog.push({
          method: String(item.method || "").toUpperCase(),
          url: String(item.url || ""),
          status: Number(item.status || 0),
          response: String(item.response || "").slice(0, 1600),
          at: new Date().toISOString(),
        });
      } catch {
        // Network evidence is best effort and never contains request credentials.
      }
    };

    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
      this.__tianyuanWorkbenchRequest = { method, url: String(url) };
      return originalOpen.call(this, method, url, ...rest);
    };
    XMLHttpRequest.prototype.send = function patchedSend(...args) {
      this.addEventListener("loadend", () => {
        push({
          ...this.__tianyuanWorkbenchRequest,
          status: this.status,
          response: this.responseText,
        });
      }, { once: true });
      return originalSend.apply(this, args);
    };

    const originalFetch = window.fetch;
    window.fetch = async function patchedFetch(input, init) {
      const response = await originalFetch.call(this, input, init);
      const url = typeof input === "string" ? input : input?.url;
      if (/attach\/upload|cell_file\/classify_upload|assignment_draft\/save/.test(String(url || ""))) {
        const clone = response.clone();
        clone.text().then((responseText) => push({
          method: init?.method || input?.method || "GET",
          url,
          status: response.status,
          response: responseText,
        })).catch(() => {});
      }
      return response;
    };
  }

  function parseNetworkResponse(responseText) {
    try {
      const parsed = JSON.parse(responseText || "{}");
      return {
        parsed,
        success: parsed?.ok === true
          || parsed?.success === true
          || parsed?.code === 0
          || parsed?.code === "0"
          || parsed?.code === 200
          || parsed?.code === "200"
          || /成功/.test(String(parsed?.message || parsed?.msg || "")),
      };
    } catch {
      return { parsed: null, success: false };
    }
  }

  function networkEvidenceSince(startIndex) {
    return (window.__tianyuanWorkbenchUploadNetworkLog || [])
      .slice(startIndex)
      .filter((item) => /attach\/upload|cell_file\/classify_upload|assignment_draft\/save/.test(item.url || ""))
      .map((item) => {
        const parsed = parseNetworkResponse(item.response);
        return {
          method: item.method,
          url: item.url,
          status: item.status,
          businessSuccess: parsed.success,
          response: item.response,
          at: item.at,
        };
      });
  }

  async function saveDraftWithNetworkEvidence(networkStart, waitMs = 7000) {
    const saveButtons = findVisibleElementsByText("保存", "button,.el-button,[role='button']");
    const pageSave = saveButtons.find((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true");
    if (!pageSave) return { ok: false, reason: "DRAFT_SAVE_BUTTON_NOT_AVAILABLE", saveNetwork: [] };
    clickElement(pageSave);
    await sleep(1000);
    const confirm = findVisibleElementByText("确定", "button,.el-button") || findVisibleElementByText("确认", "button,.el-button");
    if (confirm) {
      clickElement(confirm);
      await sleep(1200);
    }
    await sleep(waitMs);
    const saveNetwork = networkEvidenceSince(networkStart)
      .filter((item) => /assignment_draft\/save/.test(item.url || ""));
    const ok = saveNetwork.some((item) =>
      item.status >= 200 && item.status < 300 && item.businessSuccess
    );
    return { ok, reason: ok ? null : "DRAFT_SAVE_NOT_CONFIRMED", saveNetwork };
  }

  function findDialogFileInputs(dialog) {
    return [...(dialog?.querySelectorAll?.('input[type="file"]') || [])]
      .filter((input) => !input.disabled);
  }

  function describeDialogFileInputs(dialog) {
    return findDialogFileInputs(dialog).map((input, index) => {
      let owner = input.parentElement;
      for (let depth = 0; depth < 4 && owner; depth += 1, owner = owner.parentElement) {
        const ownerText = textOf(owner);
        if (ownerText && ownerText.length <= 160) {
          return {
            index,
            accept: input.accept || "",
            multiple: Boolean(input.multiple),
            label: ownerText,
          };
        }
      }
      return {
        index,
        accept: input.accept || "",
        multiple: Boolean(input.multiple),
        label: "",
      };
    });
  }

  function selectedDialogFiles(dialog) {
    return findDialogFileInputs(dialog).flatMap((input, inputIndex) =>
      [...(input.files || [])].map((file) => ({
        inputIndex,
        name: file.name || "",
        size: Number(file.size || 0),
        type: file.type || "",
      }))
    );
  }

  function chooseDialogFileInput(dialog, payload) {
    const inputs = findDialogFileInputs(dialog);
    const requestedName = String(payload?.moduleName || "").trim();
    if (requestedName) {
      const described = describeDialogFileInputs(dialog);
      const match = inputs
        .map((input, index) => ({ input, index, text: described[index]?.label || textOf(input.parentElement?.parentElement || input.parentElement) }))
        .find((item) => item.text.includes(requestedName));
      if (match) return match;
    }
    const index = Number.isInteger(payload?.moduleIndex) ? payload.moduleIndex : 0;
    return inputs[index] ? { input: inputs[index], index } : null;
  }

  async function waitForVisibleDialog(timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const dialog = findLatestVisibleDialog();
      if (dialog) return dialog;
      await sleep(100);
    }
    return null;
  }

  function locateAuditUploadCell(payload) {
    const host = document.querySelector(".spreadWrapper");
    const spread = window.GC?.Spread?.Sheets?.findControl?.(host);
    const sheet = spread?.getActiveSheet?.();
    if (!host || !spread || !sheet) {
      return { ok: false, reason: "SPREAD_CONTROL_NOT_READY" };
    }
    const fieldTitle = String(payload?.fieldTitle || FIELD_TITLE).trim();
    const columnCount = Number(sheet.getColumnCount?.() || 0);
    let col = -1;
    for (let candidate = 0; candidate < columnCount; candidate += 1) {
      const title = String(sheet.getText?.(0, candidate) || sheet.getValue?.(0, candidate) || "").trim();
      if (title === fieldTitle) {
        col = candidate;
        break;
      }
    }
    if (col < 0) return { ok: false, reason: "FIELD_NOT_FOUND", fieldTitle };

    const rowNumber = Number(payload?.rowNumber);
    if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > 100000) {
      return { ok: false, reason: "ROW_NUMBER_INVALID", rowNumber };
    }
    const row = rowNumber - 1;
    const cellType = sheet.getCellType?.(row, col);
    const location = {
      sheet,
      spread,
      sheetName: sheet.name?.() || "",
      row,
      col,
      address: `${colName(col)}${rowNumber}`,
      fieldTitle,
      text: sheet.getText?.(row, col) ?? null,
      value: sheet.getValue?.(row, col) ?? null,
      tag: sheet.getTag?.(row, col) ?? null,
      cellType: cellType ? {
        domId: cellType.domId || null,
        isReadOnly: Boolean(cellType.isReadOnly),
        hasActivateEditor: typeof cellType.activateEditor === "function",
      } : null,
    };
    if (!cellType || cellType.domId !== "operation-upload-cell" || typeof cellType.activateEditor !== "function") {
      return { ok: false, reason: "NOT_UPLOAD_CELL", location };
    }
    return { ok: true, ...location, rawCellType: cellType };
  }

  async function ensureAuditProcedureForRow(spread, sheet, row, procedureText) {
    const requested = String(procedureText || "").trim();
    if (!requested) return { ok: true, skipped: true, reason: "PROCEDURE_TEXT_EMPTY" };
    const procedureInfo = findFieldColumn(sheet, "查证类核实程序");
    if (procedureInfo.col < 0) return { ok: false, reason: "AUDIT_PROCEDURE_FIELD_NOT_FOUND" };
    const before = getSheetCellSnapshot(sheet, row, procedureInfo.col);
    if (cellHasContent(before)) {
      return {
        ok: true,
        skipped: true,
        reason: "PROCEDURE_ALREADY_FILLED",
        address: `${colName(procedureInfo.col)}${row + 1}`,
        before,
      };
    }
    const cellType = sheet.getCellType?.(row, procedureInfo.col);
    if (cellType?.isReadOnly) {
      return {
        ok: false,
        reason: "AUDIT_PROCEDURE_CELL_READONLY",
        address: `${colName(procedureInfo.col)}${row + 1}`,
        before,
      };
    }
    sheet.setValue(row, procedureInfo.col, requested);
    sheet.setActiveCell(row, procedureInfo.col);
    sheet.setSelection(row, procedureInfo.col, 1, 1);
    spread?.focus?.();
    await sleep(300);
    let after = getSheetCellSnapshot(sheet, row, procedureInfo.col);
    if (typeof cellType?.activateEditor === "function") {
      try {
        await cellType.activateEditor(true, null, null, {
          sheet,
          row,
          col: procedureInfo.col,
        });
        await sleep(300);
        const optionElement = findVisibleElementByAnyText(
          [requested],
          ".el-select-dropdown__item,[role='option'],li,button,.el-button,span,div",
        );
        if (optionElement) {
          clickElement(optionElement);
          await sleep(500);
          after = getSheetCellSnapshot(sheet, row, procedureInfo.col);
        }
      } catch {
        // Direct value assignment remains the fallback; classify/save evidence decides success.
      }
    }
    return {
      ok: true,
      skipped: false,
      address: `${colName(procedureInfo.col)}${row + 1}`,
      before,
      after,
    };
  }

  async function prepareAuditAttachmentUpload(payload) {
    const context = collectContext();
    const gate = assertDraftPage(context);
    const result = {
      ok: gate.ok,
      action: "preview_audit_attachment_upload",
      collectedAt: new Date().toISOString(),
      url: location.href,
      gate,
      security: {
        credentialsCaptured: false,
        uploadPerformed: false,
        writesPerformed: false,
      },
    };
    if (!gate.ok) return result;
    const target = locateAuditUploadCell(payload);
    result.target = target.ok ? {
      sheetName: target.sheetName,
      row: target.row,
      col: target.col,
      address: target.address,
      fieldTitle: target.fieldTitle,
      before: { text: target.text, value: target.value, tag: target.tag },
      cellType: target.cellType,
    } : target.location;
    if (!target.ok) return { ...result, ok: false, reason: target.reason };
    if (target.cellType?.isReadOnly || context.page?.saveButton?.disabled || context.page?.lockText || context.page?.permissionText) {
      return {
        ...result,
        ok: false,
        reason: "READONLY_OR_LOCKED",
        lockText: context.page?.lockText || null,
        permissionText: context.page?.permissionText || null,
      };
    }

    target.sheet.setActiveCell(target.row, target.col);
    target.sheet.setSelection(target.row, target.col, 1, 1);
    target.spread.focus?.();
    await target.rawCellType.activateEditor(true, null, null, {
      sheet: target.sheet,
      row: target.row,
      col: target.col,
    });
    const dialog = await waitForVisibleDialog();
    if (!dialog) return { ...result, ok: false, reason: "DIALOG_NOT_OPENED" };
    result.dialog = {
      text: textOf(dialog).slice(0, 1600),
      inputs: describeDialogFileInputs(dialog),
    };
    result.ok = true;
    result.steps = [{ ok: true, step: "locate_upload_dialog", message: "已打开评估核实附件分类弹窗，未注入文件。" }];
    closeDialogWithoutConfirm();
    return result;
  }

  function fileFromBase64(filePayload) {
    const raw = String(filePayload?.base64 || "");
    if (!raw) throw new Error("ATTACHMENT_DATA_EMPTY");
    const binary = atob(raw);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return new File([bytes], String(filePayload.name || "attachment"), {
      type: String(filePayload.type || "application/octet-stream"),
      lastModified: Date.now(),
    });
  }

  async function uploadAuditAttachment(payload) {
    closeDialogWithoutConfirm();
    await sleep(200);
    const context = collectContext();
    const gate = assertDraftPage(context);
    const result = {
      ok: gate.ok,
      action: "upload_audit_attachment",
      collectedAt: new Date().toISOString(),
      url: location.href,
      gate,
      steps: [],
      security: {
        credentialsCaptured: false,
        uploadPerformed: false,
        writesPerformed: false,
      },
    };
    if (!gate.ok) return result;
    if (payload?.confirmText !== "确认上传并保存") {
      return { ...result, ok: false, reason: "UPLOAD_CONFIRM_TEXT_REQUIRED" };
    }
    const target = locateAuditUploadCell(payload);
    if (!target.ok) return { ...result, ok: false, reason: target.reason, target: target.location };
    const procedure = await ensureAuditProcedureForRow(target.spread, target.sheet, target.row, payload?.procedureText);
    result.target = {
      sheetName: target.sheetName,
      row: target.row,
      col: target.col,
      address: target.address,
      fieldTitle: target.fieldTitle,
      before: { text: target.text, value: target.value, tag: target.tag },
      procedure,
    };
    if (!procedure.ok) return { ...result, ok: false, reason: procedure.reason, target: result.target };
    if (target.cellType?.isReadOnly || context.page?.saveButton?.disabled || context.page?.lockText || context.page?.permissionText) {
      return {
        ...result,
        ok: false,
        reason: "READONLY_OR_LOCKED",
        lockText: context.page?.lockText || null,
        permissionText: context.page?.permissionText || null,
      };
    }
    if (!payload.file?.base64 || !payload.file?.name) {
      return { ...result, ok: false, reason: "ATTACHMENT_FILE_PAYLOAD_MISSING" };
    }

    installUploadNetworkMonitor();
    const networkStart = window.__tianyuanWorkbenchUploadNetworkLog.length;
    if (payload?.procedureText && !procedure.skipped) {
      const procedureSave = await saveDraftWithNetworkEvidence(networkStart, 3500);
      result.procedureSave = procedureSave;
      if (!procedureSave.ok) {
        return { ...result, ok: false, reason: procedureSave.reason || "AUDIT_PROCEDURE_SAVE_FAILED" };
      }
    }
    target.sheet.setActiveCell(target.row, target.col);
    target.sheet.setSelection(target.row, target.col, 1, 1);
    target.spread.focus?.();
    await target.rawCellType.activateEditor(true, null, null, {
      sheet: target.sheet,
      row: target.row,
      col: target.col,
    });
    const dialog = await waitForVisibleDialog();
    if (!dialog) return { ...result, ok: false, reason: "DIALOG_NOT_OPENED" };
    const residualFiles = selectedDialogFiles(dialog);
    const dialogTextBeforeInject = textOf(dialog).slice(0, 1600);
    if (residualFiles.length || (payload.file?.name && dialogTextBeforeInject.includes(payload.file.name))) {
      closeDialogWithoutConfirm();
      return {
        ...result,
        ok: false,
        reason: "UPLOAD_DIALOG_HAS_RESIDUAL_FILES",
        residualFiles,
        dialogText: dialogTextBeforeInject,
      };
    }
    const selected = chooseDialogFileInput(dialog, payload);
    if (!selected) {
      return {
        ...result,
        ok: false,
        reason: "UPLOAD_MODULE_NOT_FOUND",
        modules: describeDialogFileInputs(dialog),
      };
    }
    findDialogFileInputs(dialog).forEach((input, index) => {
      if (index === selected.index) return;
      try {
        input.value = "";
        input.dispatchEvent(new Event("input", { bubbles: true }));
        input.dispatchEvent(new Event("change", { bubbles: true }));
      } catch {
        // Some browsers disallow programmatic file input clearing; upload proof will catch any duplicate side effect.
      }
    });
    const file = fileFromBase64(payload.file);
    const transfer = new DataTransfer();
    transfer.items.add(file);
    selected.input.files = transfer.files;
    selected.input.dispatchEvent(new Event("input", { bubbles: true }));
    selected.input.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(900);
    result.steps.push({
      ok: true,
      step: "inject_file",
      moduleIndex: selected.index,
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
    });

    const saveDialogButton = [...dialog.querySelectorAll("button,.el-button")]
      .filter(isVisible)
      .find((button) => textOf(button) === "保存");
    if (!saveDialogButton || saveDialogButton.disabled) {
      return { ...result, ok: false, reason: "UPLOAD_DIALOG_SAVE_NOT_AVAILABLE", dialogText: textOf(dialog).slice(0, 1600) };
    }
    clickElement(saveDialogButton);
    result.security.uploadPerformed = true;
    result.steps.push({ ok: true, step: "click_upload_dialog_save" });
    await sleep(8000);
    const afterUploadNetwork = networkEvidenceSince(networkStart);
    result.uploadNetwork = afterUploadNetwork;
    const attach = afterUploadNetwork.find((item) =>
      /attach\/upload/.test(item.url || "")
      && item.status >= 200
      && item.status < 300
      && item.businessSuccess
    );
    const classify = afterUploadNetwork.find((item) =>
      /cell_file\/classify_upload/.test(item.url || "")
      && item.status >= 200
      && item.status < 300
      && item.businessSuccess
    );
    if (!attach || !classify) {
      return {
        ...result,
        ok: false,
        reason: "UPLOAD_OR_CLASSIFY_NOT_CONFIRMED",
        procedureAfterUpload: result.target?.procedure || null,
        dialogText: dialog ? textOf(dialog).slice(0, 1600) : "",
        dialogMessages: getPageMessages(),
      };
    }
    result.steps.push({ ok: true, step: "upload_and_classify", attachmentUploaded: true, classificationGenerated: true });
    if (isVisible(dialog)) {
      return {
        ...result,
        ok: false,
        reason: "UPLOAD_DIALOG_DID_NOT_CLOSE",
        dialogText: textOf(dialog).slice(0, 1600),
      };
    }

    const draftSaveResult = await saveDraftWithNetworkEvidence(networkStart, 8000);
    const finalNetwork = networkEvidenceSince(networkStart);
    const draftSave = draftSaveResult.saveNetwork.find((item) =>
      item.status >= 200 && item.status < 300 && item.businessSuccess
    );
    const after = locateAuditUploadCell(payload);
    const afterText = after.ok ? { text: after.text, value: after.value, tag: after.tag } : null;
    const afterMessages = getPageMessages();
    result.saveNetwork = finalNetwork.filter((item) => /assignment_draft\/save/.test(item.url || ""));
    result.after = afterText;
    result.messages = afterMessages;
    result.readbackConsistent = Boolean(draftSave && (afterText?.text || afterText?.value || afterText?.tag));
    result.security.writesPerformed = Boolean(draftSave);
    result.ok = Boolean(draftSave && result.readbackConsistent);
    result.reason = result.ok ? null : (draftSave ? "DRAFT_CELL_READBACK_EMPTY" : "DRAFT_SAVE_NOT_CONFIRMED");
    return result;
  }

  async function batchUploadAuditAttachments(payload) {
    const context = collectContext();
    const gate = assertDraftPage(context);
    const result = {
      ok: gate.ok,
      action: "batch_upload_audit_attachments",
      collectedAt: new Date().toISOString(),
      url: location.href,
      gate,
      rows: [],
      security: {
        credentialsCaptured: false,
        uploadPerformed: false,
        writesPerformed: false,
      },
    };
    if (!gate.ok) return result;
    if (payload?.confirmText !== "确认批量上传并保存") {
      return { ...result, ok: false, reason: "BATCH_UPLOAD_CONFIRM_TEXT_REQUIRED" };
    }
    const rowNumbers = Array.isArray(payload?.rowNumbers)
      ? payload.rowNumbers.map((row) => Number(row)).filter((row) => Number.isInteger(row) && row >= 2)
      : [];
    const uniqueRows = [...new Set(rowNumbers)].slice(0, 50);
    if (!uniqueRows.length) return { ...result, ok: false, reason: "BATCH_UPLOAD_ROWS_REQUIRED" };
    if (!payload.file?.base64 || !payload.file?.name) {
      return { ...result, ok: false, reason: "ATTACHMENT_FILE_PAYLOAD_MISSING" };
    }

    for (const rowNumber of uniqueRows) {
      const rowPayload = {
        ...payload,
        rowNumber,
        confirmText: "确认上传并保存",
      };
      const rowResult = await uploadAuditAttachment(rowPayload);
      result.rows.push({
        rowNumber,
        ok: Boolean(rowResult?.ok),
        reason: rowResult?.reason || null,
        target: rowResult?.target || null,
        after: rowResult?.after || null,
        procedureSave: rowResult?.procedureSave || null,
        residualFiles: rowResult?.residualFiles || [],
        dialogText: rowResult?.dialogText || "",
        dialogMessages: rowResult?.dialogMessages || [],
        uploadNetwork: rowResult?.uploadNetwork || [],
        saveNetwork: rowResult?.saveNetwork || [],
        readbackConsistent: Boolean(rowResult?.readbackConsistent),
      });
      if (rowResult?.security?.uploadPerformed) result.security.uploadPerformed = true;
      if (rowResult?.security?.writesPerformed) result.security.writesPerformed = true;
      closeDialogWithoutConfirm();
      await sleep(800);
    }
    const successRows = result.rows.filter((row) => row.ok);
    const failedRows = result.rows.filter((row) => !row.ok);
    result.summary = {
      requestedRows: uniqueRows.length,
      successRows: successRows.length,
      failedRows: failedRows.length,
    };
    result.ok = successRows.length > 0 && failedRows.length === 0;
    result.partialSuccess = successRows.length > 0 && failedRows.length > 0;
    result.reason = result.ok ? null : (result.partialSuccess ? "BATCH_UPLOAD_PARTIAL_SUCCESS" : "BATCH_UPLOAD_ALL_FAILED");
    result.adapterVersion = ADAPTER_VERSION;
    return result;
  }

  function normalizeCellOptions(values) {
    const source = Array.isArray(values) ? values : [];
    const seen = new Set();
    return source.map((item) => {
      if (item && typeof item === "object") {
        const text = String(item.text ?? item.label ?? item.name ?? item.value ?? "").trim();
        const value = item.value ?? item.code ?? item.id ?? text;
        return { text, value };
      }
      return { text: String(item ?? "").trim(), value: item };
    }).filter((item) => {
      if (!item.text || seen.has(item.text)) return false;
      seen.add(item.text);
      return true;
    });
  }

  function inspectCellOptions(sheet, row, col, cellType) {
    const optionSources = [];
    try {
      if (typeof cellType?.items === "function") optionSources.push(cellType.items());
      else if (Array.isArray(cellType?.items)) optionSources.push(cellType.items);
    } catch {
      // Optional cell type metadata.
    }
    let validator = null;
    try {
      validator = sheet.getDataValidator?.(row, col) || null;
      if (typeof validator?.getValidList === "function") {
        optionSources.push(validator.getValidList(sheet, row, col));
      }
    } catch {
      // Optional validator metadata.
    }
    return {
      options: normalizeCellOptions(optionSources.flat()),
      validator: validator ? {
        constructorName: validator.constructor?.name || "",
        formula1: typeof validator.formula1 === "function" ? String(validator.formula1() || "") : "",
        type: typeof validator.type === "function" ? validator.type() : null,
      } : null,
      prototypeMethods: cellType
        ? Object.getOwnPropertyNames(Object.getPrototypeOf(cellType)).filter((name) => name !== "constructor").slice(0, 80)
        : [],
    };
  }

  function locateFieldCell(payload, allowedTitle) {
    const host = document.querySelector(".spreadWrapper");
    const spread = window.GC?.Spread?.Sheets?.findControl?.(host);
    const sheet = spread?.getActiveSheet?.();
    if (!host || !spread || !sheet) return { ok: false, reason: "SPREAD_CONTROL_NOT_READY" };
    const fieldTitle = String(payload?.fieldTitle || allowedTitle).trim();
    if (fieldTitle !== allowedTitle) return { ok: false, reason: "FIELD_TITLE_NOT_ALLOWED", fieldTitle };
    const rowNumber = Number(payload?.rowNumber);
    if (!Number.isInteger(rowNumber) || rowNumber < 2 || rowNumber > 100000) {
      return { ok: false, reason: "ROW_NUMBER_INVALID", rowNumber };
    }
    let col = -1;
    const columnCount = Number(sheet.getColumnCount?.() || 0);
    const headers = [];
    for (let candidate = 0; candidate < columnCount; candidate += 1) {
      const title = String(sheet.getText?.(0, candidate) || sheet.getValue?.(0, candidate) || "").trim();
      headers.push({ col: candidate, address: colName(candidate), title });
      if (title === fieldTitle) col = candidate;
    }
    if (col < 0) return { ok: false, reason: "FIELD_NOT_FOUND", fieldTitle, headers: headers.slice(0, 160) };
    const row = rowNumber - 1;
    const cellType = sheet.getCellType?.(row, col);
    const optionInfo = inspectCellOptions(sheet, row, col, cellType);
    return {
      ok: true,
      spread,
      sheet,
      row,
      col,
      rowNumber,
      fieldTitle,
      address: `${colName(col)}${rowNumber}`,
      text: sheet.getText?.(row, col) ?? null,
      value: sheet.getValue?.(row, col) ?? null,
      tag: sheet.getTag?.(row, col) ?? null,
      cellType,
      cellTypeSummary: cellType ? {
        constructorName: cellType.constructor?.name || "",
        domId: cellType.domId || "",
        isReadOnly: Boolean(cellType.isReadOnly),
        hasActivateEditor: typeof cellType.activateEditor === "function",
      } : null,
      ...optionInfo,
      nearbyHeaders: headers.slice(Math.max(0, col - 4), Math.min(headers.length, col + 5)),
    };
  }

  function findFieldColumn(sheet, fieldTitle) {
    const columnCount = Number(sheet.getColumnCount?.() || 0);
    const headers = [];
    let col = -1;
    for (let candidate = 0; candidate < columnCount; candidate += 1) {
      const title = String(sheet.getText?.(0, candidate) || sheet.getValue?.(0, candidate) || "").trim();
      headers.push({ col: candidate, address: colName(candidate), title });
      if (title === fieldTitle) col = candidate;
    }
    return { col, headers };
  }

  function getSheetCellSnapshot(sheet, row, col) {
    if (col < 0) return { text: "", value: null, tag: null };
    return {
      text: sheet.getText?.(row, col) ?? "",
      value: sheet.getValue?.(row, col) ?? null,
      tag: sheet.getTag?.(row, col) ?? null,
    };
  }

  function tagHasContent(tag) {
    if (tag === null || tag === undefined) return false;
    if (typeof tag === "string") return Boolean(tag.trim());
    if (typeof tag !== "object") return Boolean(String(tag).trim());
    if (tag.isClear === true && !tag.fileId && !tag.fileIds && !tag.batchId && !tag.value) return false;
    return Boolean(tag.fileId || tag.fileIds || tag.batchId || tag.value);
  }

  function cellHasContent(snapshot) {
    return Boolean(
      String(snapshot?.text ?? "").trim()
      || String(snapshot?.value ?? "").trim()
      || tagHasContent(snapshot?.tag)
    );
  }

  function getCurrentSheet() {
    const host = document.querySelector(".spreadWrapper");
    const spread = window.GC?.Spread?.Sheets?.findControl?.(host);
    const sheet = spread?.getActiveSheet?.();
    if (!host || !spread || !sheet) return { ok: false, reason: "SPREAD_CONTROL_NOT_READY" };
    return { ok: true, spread, sheet };
  }

  function collectAuditIndexRows(payload = {}) {
    const current = getCurrentSheet();
    if (!current.ok) return current;
    const { sheet } = current;
    const procedureInfo = findFieldColumn(sheet, "查证类核实程序");
    const indexInfo = findFieldColumn(sheet, "查证资料索引");
    const checkInfo = findFieldColumn(sheet, "查证核对情况");
    if (indexInfo.col < 0) return { ok: false, reason: "AUDIT_INDEX_FIELD_NOT_FOUND", headers: indexInfo.headers.slice(0, 160) };
    if (checkInfo.col < 0) return { ok: false, reason: "AUDIT_CHECK_FIELD_NOT_FOUND", headers: checkInfo.headers.slice(0, 160) };

    const rowCount = Number(sheet.getRowCount?.() || 0);
    const maxRows = Math.max(2, Math.min(Number(payload.maxRows || 500), 5000));
    const lastRow = Math.min(rowCount - 1, maxRows - 1);
    const rows = [];
    const rowsWithIndex = [];
    const rowsNeedingCheck = [];
    for (let row = 1; row <= lastRow; row += 1) {
      const indexCell = getSheetCellSnapshot(sheet, row, indexInfo.col);
      const checkCell = getSheetCellSnapshot(sheet, row, checkInfo.col);
      const procedureCell = getSheetCellSnapshot(sheet, row, procedureInfo.col);
      const hasIndex = cellHasContent(indexCell);
      const hasCheck = cellHasContent(checkCell);
      const item = {
        row,
        rowNumber: row + 1,
        indexAddress: `${colName(indexInfo.col)}${row + 1}`,
        checkAddress: `${colName(checkInfo.col)}${row + 1}`,
        index: indexCell,
        check: checkCell,
        procedure: procedureCell,
        hasIndex,
        hasCheck,
        hasProcedure: cellHasContent(procedureCell),
      };
      rows.push(item);
      if (hasIndex) rowsWithIndex.push(item);
      if (hasIndex && !hasCheck) rowsNeedingCheck.push(item);
    }
    return {
      ok: true,
      spread: current.spread,
      sheet,
      sheetName: sheet.name?.() || "",
      rowCount,
      scannedRows: Math.max(0, lastRow),
      truncated: rowCount > maxRows,
      columns: {
        auditProcedure: { col: procedureInfo.col, address: procedureInfo.col >= 0 ? colName(procedureInfo.col) : null, title: "查证类核实程序" },
        auditIndex: { col: indexInfo.col, address: colName(indexInfo.col), title: "查证资料索引" },
        auditCheck: { col: checkInfo.col, address: colName(checkInfo.col), title: "查证核对情况" },
      },
      rows,
      rowsWithIndex,
      rowsNeedingCheck,
    };
  }

  async function scanAuditIndexCheckRows(payload) {
    const context = collectContext();
    const gate = assertDraftPage(context);
    const result = {
      ok: gate.ok,
      action: "scan_audit_index_check_rows",
      collectedAt: new Date().toISOString(),
      url: location.href,
      gate,
      security: {
        credentialsCaptured: false,
        writesPerformed: false,
      },
    };
    if (!gate.ok) return result;
    const scan = collectAuditIndexRows(payload);
    if (!scan.ok) return { ...result, ok: false, reason: scan.reason, headers: scan.headers || [] };
    return {
      ...result,
      ok: true,
      sheetName: scan.sheetName,
      rowCount: scan.rowCount,
      scannedRows: scan.scannedRows,
      truncated: scan.truncated,
      columns: scan.columns,
      rowsWithIndex: scan.rowsWithIndex.map((row) => ({
        rowNumber: row.rowNumber,
        indexAddress: row.indexAddress,
        checkAddress: row.checkAddress,
        index: row.index,
        check: row.check,
        procedure: row.procedure,
        hasCheck: row.hasCheck,
        hasProcedure: row.hasProcedure,
      })),
      rowsNeedingCheck: scan.rowsNeedingCheck.map((row) => ({
        rowNumber: row.rowNumber,
        indexAddress: row.indexAddress,
        checkAddress: row.checkAddress,
        index: row.index,
      })),
      summary: {
        rowsWithIndex: scan.rowsWithIndex.length,
        rowsNeedingCheck: scan.rowsNeedingCheck.length,
      },
      adapterVersion: ADAPTER_VERSION,
    };
  }

  async function batchSetAuditCheckResults(payload) {
    const context = collectContext();
    const gate = assertDraftPage(context);
    const result = {
      ok: gate.ok,
      action: "batch_set_audit_check_results",
      collectedAt: new Date().toISOString(),
      url: location.href,
      gate,
      steps: [],
      security: {
        credentialsCaptured: false,
        writesPerformed: false,
      },
    };
    if (!gate.ok) return result;
    if (payload?.confirmText !== "确认批量填写核对情况并保存") {
      return { ...result, ok: false, reason: "BATCH_AUDIT_CHECK_CONFIRM_TEXT_REQUIRED" };
    }
    const requestedText = String(payload?.resultText || "").trim();
    if (!requestedText || requestedText.length > 80) return { ...result, ok: false, reason: "AUDIT_CHECK_RESULT_INVALID" };
    if (context.page?.saveButton?.disabled || context.page?.lockText || context.page?.permissionText) {
      return { ...result, ok: false, reason: "READONLY_OR_LOCKED" };
    }
    const scan = collectAuditIndexRows(payload);
    if (!scan.ok) return { ...result, ok: false, reason: scan.reason, headers: scan.headers || [] };
    const requestedRows = Array.isArray(payload?.rowNumbers) && payload.rowNumbers.length
      ? new Set(payload.rowNumbers.map((row) => Number(row)).filter((row) => Number.isInteger(row) && row >= 2))
      : null;
    const candidates = (requestedRows
      ? scan.rowsWithIndex.filter((row) => requestedRows.has(row.rowNumber))
      : scan.rowsNeedingCheck
    ).filter((row) => row.hasIndex);
    if (!candidates.length) {
      return {
        ...result,
        ok: true,
        sheetName: scan.sheetName,
        columns: scan.columns,
        updatedRows: [],
        skippedReason: "NO_ROWS_NEED_UPDATE",
        summary: {
          rowsWithIndex: scan.rowsWithIndex.length,
          rowsNeedingCheck: scan.rowsNeedingCheck.length,
          updatedRows: 0,
        },
        adapterVersion: ADAPTER_VERSION,
      };
    }
    const checkCellType = scan.sheet.getCellType?.(candidates[0].row, scan.columns.auditCheck.col);
    const optionInfo = inspectCellOptions(scan.sheet, candidates[0].row, scan.columns.auditCheck.col, checkCellType);
    if (optionInfo.options.length && !optionInfo.options.some((item) =>
      item.text === requestedText || item.text.includes(requestedText) || requestedText.includes(item.text)
    )) {
      return { ...result, ok: false, reason: "AUDIT_CHECK_OPTION_NOT_ALLOWED", options: optionInfo.options };
    }
    const nextValue = optionInfo.options.length
      ? (optionInfo.options.find((item) => item.text === requestedText)
        || optionInfo.options.find((item) => item.text.includes(requestedText) || requestedText.includes(item.text)))?.value
      : requestedText;

    installUploadNetworkMonitor();
    const networkStart = window.__tianyuanWorkbenchUploadNetworkLog.length;
    const updatedRows = [];
    for (const row of candidates) {
      const cellType = scan.sheet.getCellType?.(row.row, scan.columns.auditCheck.col);
      if (cellType?.isReadOnly) {
        updatedRows.push({ rowNumber: row.rowNumber, ok: false, reason: "CELL_READONLY", before: row.check });
        continue;
      }
      scan.sheet.setValue(row.row, scan.columns.auditCheck.col, nextValue);
      updatedRows.push({
        rowNumber: row.rowNumber,
        ok: true,
        before: row.check,
        afterSet: getSheetCellSnapshot(scan.sheet, row.row, scan.columns.auditCheck.col),
        indexAddress: row.indexAddress,
        checkAddress: row.checkAddress,
      });
    }
    scan.sheet.setActiveCell(candidates[0].row, scan.columns.auditCheck.col);
    scan.sheet.setSelection(candidates[0].row, scan.columns.auditCheck.col, candidates.length, 1);
    scan.spread.focus?.();
    await sleep(500);
    result.steps.push({ ok: true, step: "batch_set_audit_check_results", requestedText, updatedRows });
    const saveButtons = findVisibleElementsByText("保存", "button,.el-button,[role='button']");
    const saveButton = saveButtons.find((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true");
    if (!saveButton) return { ...result, ok: false, reason: "DRAFT_SAVE_BUTTON_NOT_AVAILABLE", updatedRows };
    clickElement(saveButton);
    await sleep(1000);
    const confirm = findVisibleElementByText("确定", "button,.el-button") || findVisibleElementByText("确认", "button,.el-button");
    if (confirm) {
      clickElement(confirm);
      await sleep(1200);
    }
    await sleep(7000);
    const saveNetwork = networkEvidenceSince(networkStart)
      .filter((item) => /assignment_draft\/save/.test(item.url || ""));
    const saveSuccess = saveNetwork.some((item) =>
      item.status >= 200 && item.status < 300 && item.businessSuccess
    );
    const readback = candidates.map((row) => {
      const after = getSheetCellSnapshot(scan.sheet, row.row, scan.columns.auditCheck.col);
      const matches = String(after.text ?? after.value ?? "").trim() === requestedText
        || String(after.text ?? "").includes(requestedText);
      return {
        rowNumber: row.rowNumber,
        checkAddress: row.checkAddress,
        after,
        matches,
      };
    });
    result.sheetName = scan.sheetName;
    result.columns = scan.columns;
    result.updatedRows = updatedRows;
    result.readback = readback;
    result.saveNetwork = saveNetwork;
    result.saveSuccess = saveSuccess;
    result.readbackConsistent = Boolean(saveSuccess && readback.every((row) => row.matches));
    result.security.writesPerformed = saveSuccess;
    result.summary = {
      rowsWithIndex: scan.rowsWithIndex.length,
      rowsNeedingCheck: scan.rowsNeedingCheck.length,
      updatedRows: updatedRows.filter((row) => row.ok).length,
    };
    result.ok = result.readbackConsistent;
    result.reason = result.ok ? null : (saveSuccess ? "BATCH_AUDIT_CHECK_READBACK_MISMATCH" : "DRAFT_SAVE_NOT_CONFIRMED");
    result.adapterVersion = ADAPTER_VERSION;
    return result;
  }

  async function clearAuditTestRows(payload) {
    const context = collectContext();
    const gate = assertDraftPage(context);
    const result = {
      ok: gate.ok,
      action: "clear_audit_test_rows",
      collectedAt: new Date().toISOString(),
      url: location.href,
      gate,
      rows: [],
      security: {
        credentialsCaptured: false,
        writesPerformed: false,
      },
    };
    if (!gate.ok) return result;
    if (payload?.confirmText !== "确认清理测试数据并保存") {
      return { ...result, ok: false, reason: "CLEAR_TEST_DATA_CONFIRM_TEXT_REQUIRED" };
    }
    if (context.page?.saveButton?.disabled || context.page?.lockText || context.page?.permissionText) {
      return { ...result, ok: false, reason: "READONLY_OR_LOCKED" };
    }
    const scan = collectAuditIndexRows(payload);
    if (!scan.ok) return { ...result, ok: false, reason: scan.reason, headers: scan.headers || [] };
    const rowNumbers = Array.isArray(payload?.rowNumbers)
      ? [...new Set(payload.rowNumbers.map((row) => Number(row)).filter((row) => Number.isInteger(row) && row >= 2))]
      : [];
    if (!rowNumbers.length || rowNumbers.length > 100) {
      return { ...result, ok: false, reason: "CLEAR_TEST_ROWS_INVALID" };
    }
    const expectedIndexValues = new Set((Array.isArray(payload?.expectedIndexValues) ? payload.expectedIndexValues : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean));
    const rowIndexes = rowNumbers.map((rowNumber) => rowNumber - 1);
    const columns = {
      auditProcedure: scan.columns.auditProcedure.col,
      auditIndex: scan.columns.auditIndex.col,
      auditCheck: scan.columns.auditCheck.col,
    };
    if (columns.auditProcedure < 0 || columns.auditIndex < 0 || columns.auditCheck < 0) {
      return { ...result, ok: false, reason: "CLEAR_TEST_REQUIRED_FIELDS_NOT_FOUND", columns: scan.columns };
    }

    const snapshots = rowIndexes.map((row) => ({
      row,
      rowNumber: row + 1,
      procedure: getSheetCellSnapshot(scan.sheet, row, columns.auditProcedure),
      index: getSheetCellSnapshot(scan.sheet, row, columns.auditIndex),
      check: getSheetCellSnapshot(scan.sheet, row, columns.auditCheck),
    }));
    if (expectedIndexValues.size) {
      const mismatches = snapshots.filter((item) => {
        const current = String(item.index.text || item.index.value || "").trim();
        return current && !expectedIndexValues.has(current);
      });
      if (mismatches.length) {
        return {
          ...result,
          ok: false,
          reason: "CLEAR_TEST_INDEX_VALUE_MISMATCH",
          mismatches: mismatches.map((item) => ({ rowNumber: item.rowNumber, index: item.index })),
        };
      }
    }

    installUploadNetworkMonitor();
    const networkStart = window.__tianyuanWorkbenchUploadNetworkLog.length;
    for (const item of snapshots) {
      scan.sheet.setValue(item.row, columns.auditProcedure, "");
      scan.sheet.setValue(item.row, columns.auditIndex, null);
      scan.sheet.setTag?.(item.row, columns.auditIndex, { fileId: null, isClear: true });
      scan.sheet.setValue(item.row, columns.auditCheck, "");
      result.rows.push({
        rowNumber: item.rowNumber,
        before: item,
        addresses: {
          procedure: `${colName(columns.auditProcedure)}${item.rowNumber}`,
          index: `${colName(columns.auditIndex)}${item.rowNumber}`,
          check: `${colName(columns.auditCheck)}${item.rowNumber}`,
        },
      });
    }
    scan.sheet.setActiveCell(rowIndexes[0], columns.auditIndex);
    scan.sheet.setSelection(rowIndexes[0], columns.auditProcedure, rowIndexes.length, 3);
    scan.spread.focus?.();
    await sleep(500);
    const saveResult = await saveDraftWithNetworkEvidence(networkStart, 8000);
    const readback = snapshots.map((item) => {
      const after = {
        procedure: getSheetCellSnapshot(scan.sheet, item.row, columns.auditProcedure),
        index: getSheetCellSnapshot(scan.sheet, item.row, columns.auditIndex),
        check: getSheetCellSnapshot(scan.sheet, item.row, columns.auditCheck),
      };
      return {
        rowNumber: item.rowNumber,
        after,
        cleared: !cellHasContent(after.procedure) && !cellHasContent(after.index) && !cellHasContent(after.check),
      };
    });
    result.sheetName = scan.sheetName;
    result.columns = scan.columns;
    result.saveNetwork = saveResult.saveNetwork || [];
    result.saveSuccess = Boolean(saveResult.ok);
    result.readback = readback;
    result.readbackConsistent = Boolean(saveResult.ok && readback.every((row) => row.cleared));
    result.security.writesPerformed = Boolean(saveResult.ok);
    result.summary = {
      requestedRows: rowNumbers.length,
      clearedRows: readback.filter((row) => row.cleared).length,
    };
    result.ok = result.readbackConsistent;
    result.reason = result.ok ? null : (saveResult.ok ? "CLEAR_TEST_READBACK_NOT_EMPTY" : saveResult.reason || "DRAFT_SAVE_NOT_CONFIRMED");
    result.adapterVersion = ADAPTER_VERSION;
    return result;
  }

  async function inspectAuditCheckRow(payload) {
    const context = collectContext();
    const gate = assertDraftPage(context);
    const result = {
      ok: gate.ok,
      action: "inspect_audit_check_row",
      collectedAt: new Date().toISOString(),
      url: location.href,
      gate,
      security: {
        credentialsCaptured: false,
        writesPerformed: false,
      },
    };
    if (!gate.ok) return result;
    const target = locateFieldCell(payload, "查证核对情况");
    if (!target.ok) return { ...result, ok: false, reason: target.reason, target };
    return {
      ...result,
      ok: true,
      target: {
        sheetName: target.sheet.name?.() || "",
        row: target.row,
        col: target.col,
        address: target.address,
        fieldTitle: target.fieldTitle,
        text: target.text,
        value: target.value,
        tag: target.tag,
        cellType: target.cellTypeSummary,
        options: target.options,
        validator: target.validator,
        prototypeMethods: target.prototypeMethods,
        nearbyHeaders: target.nearbyHeaders,
      },
    };
  }

  function findOptionValue(target, requestedText) {
    const requested = String(requestedText || "").trim();
    const option = target.options.find((item) => item.text === requested)
      || target.options.find((item) => item.text.includes(requested) || requested.includes(item.text));
    return option ? option.value : requested;
  }

  async function setAuditCheckResult(payload) {
    const context = collectContext();
    const gate = assertDraftPage(context);
    const result = {
      ok: gate.ok,
      action: "set_audit_check_result",
      collectedAt: new Date().toISOString(),
      url: location.href,
      gate,
      steps: [],
      security: {
        credentialsCaptured: false,
        writesPerformed: false,
      },
    };
    if (!gate.ok) return result;
    if (payload?.confirmText !== "确认填写核对情况并保存") {
      return { ...result, ok: false, reason: "AUDIT_CHECK_CONFIRM_TEXT_REQUIRED" };
    }
    const requestedText = String(payload?.resultText || "").trim();
    if (!requestedText || requestedText.length > 80) {
      return { ...result, ok: false, reason: "AUDIT_CHECK_RESULT_INVALID" };
    }
    const target = locateFieldCell(payload, "查证核对情况");
    if (!target.ok) return { ...result, ok: false, reason: target.reason, target };
    if (target.cellTypeSummary?.isReadOnly || context.page?.saveButton?.disabled || context.page?.lockText || context.page?.permissionText) {
      return { ...result, ok: false, reason: "READONLY_OR_LOCKED" };
    }
    if (target.options.length && !target.options.some((item) =>
      item.text === requestedText || item.text.includes(requestedText) || requestedText.includes(item.text)
    )) {
      return {
        ...result,
        ok: false,
        reason: "AUDIT_CHECK_OPTION_NOT_ALLOWED",
        options: target.options,
      };
    }

    const before = { text: target.text, value: target.value, tag: target.tag };
    const nextValue = findOptionValue(target, requestedText);
    installUploadNetworkMonitor();
    const networkStart = window.__tianyuanWorkbenchUploadNetworkLog.length;
    target.sheet.setValue(target.row, target.col, nextValue);
    target.sheet.setActiveCell(target.row, target.col);
    target.sheet.setSelection(target.row, target.col, 1, 1);
    target.spread.focus?.();
    await sleep(500);
    let afterSet = {
      text: target.sheet.getText?.(target.row, target.col) ?? null,
      value: target.sheet.getValue?.(target.row, target.col) ?? null,
      tag: target.sheet.getTag?.(target.row, target.col) ?? null,
    };

    if (String(afterSet.text || "").trim() !== requestedText && typeof target.cellType?.activateEditor === "function") {
      await target.cellType.activateEditor(true, null, null, {
        sheet: target.sheet,
        row: target.row,
        col: target.col,
      });
      await sleep(300);
      const optionElement = findVisibleElementByAnyText(
        [requestedText],
        ".el-select-dropdown__item,[role='option'],li,button,.el-button,span,div",
      );
      if (optionElement) {
        clickElement(optionElement);
        await sleep(500);
        afterSet = {
          text: target.sheet.getText?.(target.row, target.col) ?? null,
          value: target.sheet.getValue?.(target.row, target.col) ?? null,
          tag: target.sheet.getTag?.(target.row, target.col) ?? null,
        };
      }
    }

    result.steps.push({ ok: true, step: "set_audit_check_result", requestedText, before, afterSet });
    const saveButtons = findVisibleElementsByText("保存", "button,.el-button,[role='button']");
    const saveButton = saveButtons.find((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true");
    if (!saveButton) return { ...result, ok: false, reason: "DRAFT_SAVE_BUTTON_NOT_AVAILABLE", before, afterSet };
    clickElement(saveButton);
    await sleep(1000);
    const confirm = findVisibleElementByText("确定", "button,.el-button") || findVisibleElementByText("确认", "button,.el-button");
    if (confirm) {
      clickElement(confirm);
      await sleep(1200);
    }
    await sleep(7000);
    const saveNetwork = networkEvidenceSince(networkStart)
      .filter((item) => /assignment_draft\/save/.test(item.url || ""));
    const saveSuccess = saveNetwork.some((item) =>
      item.status >= 200 && item.status < 300 && item.businessSuccess
    );
    const after = locateFieldCell(payload, "查证核对情况");
    const readback = after.ok ? { text: after.text, value: after.value, tag: after.tag } : null;
    const displayMatches = String(readback?.text ?? readback?.value ?? "").trim() === requestedText
      || String(readback?.text ?? "").includes(requestedText);
    result.before = before;
    result.after = readback;
    result.options = target.options;
    result.saveNetwork = saveNetwork;
    result.saveSuccess = saveSuccess;
    result.readbackConsistent = Boolean(saveSuccess && displayMatches);
    result.security.writesPerformed = saveSuccess;
    result.ok = result.readbackConsistent;
    result.reason = result.ok ? null : (saveSuccess ? "AUDIT_CHECK_READBACK_MISMATCH" : "DRAFT_SAVE_NOT_CONFIRMED");
    return result;
  }

  async function saveCurrentDraft(payload) {
    const mode = payload?.mode === "execute" ? "execute" : "dry_run";
    const companyScope = payload?.companyScope || "current";
    const companyFilters = Array.isArray(payload?.companyFilters) ? payload.companyFilters : [];
    const selectedCompanies = Array.isArray(payload?.selectedCompanies) ? payload.selectedCompanies : [];
    const before = collectContext();
    const gate = assertDraftPage(before);

    const result = {
      ok: gate.ok,
      action: "save_asset_draft_current_subject",
      mode,
      companyScope,
      companyFilters,
      selectedCompanies,
      collectedAt: new Date().toISOString(),
      url: location.href,
      before,
      gate,
      steps: [],
      security: {
        credentialsCaptured: false,
        uploadPerformed: false,
        writesPerformed: false,
      },
    };

    if (!gate.ok) return result;

    if (mode === "dry_run") {
      result.steps.push({
        ok: true,
        step: "dry_run_only",
        message: "已定位保存按钮和页面上下文，未点击保存。",
      });
      result.ok = true;
      return result;
    }

    if (payload?.confirmText !== "确认保存") {
      result.ok = false;
      result.gate = { ok: false, reason: "CONFIRM_TEXT_REQUIRED" };
      return result;
    }

    const companySelection = await selectCompanyScope(companyScope, companyFilters, selectedCompanies);
    result.steps.push({ step: "select_company_scope", ...companySelection });
    if (!companySelection.ok) {
      result.ok = false;
      return result;
    }

    const saveButtons = findVisibleElementsByText("保存", "button,.el-button,[role='button']");
    const saveButton = saveButtons.find((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true") || saveButtons[0];
    if (!saveButton) {
      result.ok = false;
      result.steps.push({ ok: false, step: "click_save", reason: "SAVE_BUTTON_NOT_FOUND" });
      return result;
    }

    clickElement(saveButton);
    result.security.writesPerformed = true;
    result.steps.push({ ok: true, step: "click_save", buttonText: textOf(saveButton) });
    await sleep(1800);

    const confirm = findVisibleElementByText("确定", "button,.el-button") || findVisibleElementByText("确认", "button,.el-button");
    if (confirm) {
      clickElement(confirm);
      result.steps.push({ ok: true, step: "confirm_dialog", buttonText: textOf(confirm) });
      await sleep(1500);
    }

    await sleep(2500);
    const after = collectContext();
    const bodyText = document.body?.innerText || "";
    const saveSuccess = bodyText.includes("保存成功");
    result.after = after;
    result.messages = getPageMessages();
    result.saveSuccessTextFound = saveSuccess;
    result.ok = true;
    return result;
  }

  async function exitEditCurrentSubject(payload) {
    const mode = payload?.mode === "execute" ? "execute" : "dry_run";
    const companyScope = payload?.companyScope || "current";
    const companyFilters = Array.isArray(payload?.companyFilters) ? payload.companyFilters : [];
    const selectedCompanies = Array.isArray(payload?.selectedCompanies) ? payload.selectedCompanies : [];
    const before = collectContext();
    const gate = assertDraftPage(before);

    const result = {
      ok: gate.ok,
      action: "exit_edit_current_subject",
      mode,
      companyScope,
      companyFilters,
      selectedCompanies,
      collectedAt: new Date().toISOString(),
      url: location.href,
      before,
      gate,
      steps: [],
      security: {
        credentialsCaptured: false,
        uploadPerformed: false,
        writesPerformed: false,
      },
    };

    if (!gate.ok) return result;

    const locateExitButton = () => {
      const exitButtons = findVisibleElementsByText("退出编辑", "button,.el-button,[role='button'],a,span");
      return exitButtons.find((button) => !button.disabled && button.getAttribute("aria-disabled") !== "true") || exitButtons[0];
    };

    let exitButton = locateExitButton();
    if (!exitButton) {
      result.ok = false;
      result.steps.push({ ok: false, step: "locate_exit_edit", reason: "EXIT_EDIT_BUTTON_NOT_FOUND" });
      return result;
    }

    if (mode === "dry_run") {
      result.steps.push({
        ok: true,
        step: "dry_run_only",
        buttonText: textOf(exitButton),
        message: "已定位退出编辑按钮和页面上下文，未点击退出编辑。",
      });
      result.ok = true;
      return result;
    }

    if (payload?.confirmText !== "确认退出编辑") {
      result.ok = false;
      result.gate = { ok: false, reason: "EXIT_CONFIRM_TEXT_REQUIRED" };
      return result;
    }

    const companySelection = await selectCompanyScope(companyScope, companyFilters, selectedCompanies);
    result.steps.push({ step: "select_company_scope", ...companySelection });
    if (!companySelection.ok) {
      result.ok = false;
      return result;
    }

    exitButton = locateExitButton();
    if (!exitButton) {
      result.ok = false;
      result.steps.push({ ok: false, step: "locate_exit_edit_after_company_scope", reason: "EXIT_EDIT_BUTTON_NOT_FOUND" });
      return result;
    }

    clickElement(exitButton);
    result.security.writesPerformed = true;
    result.steps.push({ ok: true, step: "click_exit_edit", buttonText: textOf(exitButton) });
    await sleep(1200);

    const confirm = findVisibleElementByText("确定", "button,.el-button") || findVisibleElementByText("确认", "button,.el-button");
    if (confirm) {
      clickElement(confirm);
      result.steps.push({ ok: true, step: "confirm_dialog", buttonText: textOf(confirm) });
      await sleep(1500);
    }

    await sleep(2000);
    const after = collectContext();
    const bodyText = document.body?.innerText || "";
    result.after = after;
    result.messages = getPageMessages();
    result.exitSuccessTextFound = /退出编辑成功|退出成功|操作成功/.test(bodyText);
    result.ok = true;
    return result;
  }

  async function activateSubjectByLabel(label) {
    const target = String(label || "").trim();
    const result = {
      ok: false,
      action: "activate_subject_by_label",
      label: target,
      collectedAt: new Date().toISOString(),
      url: location.href,
    };

    if (!target) return { ...result, reason: "LABEL_EMPTY" };

    const candidates = [...document.querySelectorAll(".el-tree-node__content, .el-tree-node__label, [role='treeitem'], li, .subject-tree span, span")]
      .filter(isVisible)
      .map((element) => ({ element, text: textOf(element) }))
      .filter((item) => item.text === target);

    const match = candidates[0];
    if (!match) {
      return {
        ...result,
        reason: "SUBJECT_LABEL_NOT_FOUND",
        visibleSubjects: collectSubjectTreeItems().slice(0, 120),
      };
    }

    clickElement(match.element);
    await sleep(1800);
    result.ok = true;
    result.after = collectContext();
    return result;
  }

  async function activateSubjectByPath(path) {
    const targetPath = String(path || "").trim();
    const result = {
      ok: false,
      action: "activate_subject_by_path",
      path: targetPath,
      collectedAt: new Date().toISOString(),
      url: location.href,
    };
    if (!targetPath) return { ...result, reason: "PATH_EMPTY" };

    function directNodeText(node) {
      const content = node?.querySelector?.(":scope > .el-tree-node__content")
        || node?.querySelector?.(".el-tree-node__content");
      return textOf(content || node);
    }

    function nodePath(node) {
      const parts = [];
      let current = node;
      while (current) {
        if (current.classList?.contains("el-tree-node")) {
          const text = directNodeText(current);
          if (text) parts.unshift(text);
        }
        current = current.parentElement?.closest?.(".el-tree-node") || null;
      }
      return parts.join("/");
    }

    function findMatch() {
      return [...document.querySelectorAll(".el-tree-node")]
        .filter(isVisible)
        .map((node) => ({
          node,
          path: nodePath(node),
          content: node.querySelector?.(":scope > .el-tree-node__content")
            || node.querySelector?.(".el-tree-node__content"),
        }))
        .find((item) => item.path === targetPath || item.path.endsWith(`/${targetPath}`));
    }

    let match = findMatch();
    const rootContainers = [".el-tree", "[role='tree']", ".subject-tree"]
      .flatMap((selector) => [...document.querySelectorAll(selector)])
      .filter(isVisible);
    const scrollTargets = getTreeScrollTargets(rootContainers);

    for (const target of scrollTargets) {
      if (match) break;
      const originalTop = target.scrollTop;
      for (let round = 0; round < 30 && !match; round += 1) {
        match = findMatch();
        const maxTop = Math.max(0, target.scrollHeight - target.clientHeight);
        if (target.scrollTop >= maxTop - 2) break;
        target.scrollTop = Math.min(maxTop, target.scrollTop + Math.max(120, Math.floor(target.clientHeight * 0.8)));
        target.dispatchEvent(new Event("scroll", { bubbles: true }));
        await sleep(120);
      }
      if (!match) {
        target.scrollTop = originalTop;
        target.dispatchEvent(new Event("scroll", { bubbles: true }));
      }
    }

    if (!match?.content) {
      return { ...result, reason: "SUBJECT_PATH_NOT_FOUND", visibleSubjects: collectSubjectTreeItems().slice(0, 120) };
    }

    clickElement(match.content);
    await sleep(1800);
    result.ok = true;
    result.after = collectContext();
    return result;
  }

  async function runAction(payload) {
    if (payload?.action === "save_asset_draft_current_subject") {
      return await saveCurrentDraft(payload);
    }
    if (payload?.action === "exit_edit_current_subject") {
      return await exitEditCurrentSubject(payload);
    }
    if (payload?.action === "list_asset_draft_companies") {
      return await listCompaniesFromSelector();
    }
    if (payload?.action === "list_asset_draft_subjects") {
      return await listAssetDraftSubjects();
    }
    if (payload?.action === "open_company_selector") {
      return await openCompanySelector();
    }
    if (payload?.action === "read_selected_companies") {
      return await readSelectedCompaniesFromOpenDialog(payload || {});
    }
    if (payload?.action === "list_equity_table_companies") {
      return await listEquityTableCompanies();
    }
    if (payload?.action === "activate_subject_by_label") {
      return await activateSubjectByLabel(payload?.label);
    }
    if (payload?.action === "activate_subject_by_path") {
      return await activateSubjectByPath(payload?.path);
    }
    if (payload?.action === "preview_audit_attachment_upload") {
      return await prepareAuditAttachmentUpload(payload);
    }
    if (payload?.action === "upload_audit_attachment") {
      return await uploadAuditAttachment(payload);
    }
    if (payload?.action === "batch_upload_audit_attachments") {
      return await batchUploadAuditAttachments(payload);
    }
    if (payload?.action === "inspect_audit_check_row") {
      return await inspectAuditCheckRow(payload);
    }
    if (payload?.action === "set_audit_check_result") {
      return await setAuditCheckResult(payload);
    }
    if (payload?.action === "scan_audit_index_check_rows") {
      return await scanAuditIndexCheckRows(payload);
    }
    if (payload?.action === "batch_set_audit_check_results") {
      return await batchSetAuditCheckResults(payload);
    }
    if (payload?.action === "clear_audit_test_rows") {
      return await clearAuditTestRows(payload);
    }

    return {
      ok: false,
      reason: "UNKNOWN_ACTION",
      action: payload?.action || null,
      collectedAt: new Date().toISOString(),
      url: location.href,
    };
  }

  if (window.__tianyuanWorkbenchPageAdapterVersion === ADAPTER_VERSION) return;
  window.__tianyuanWorkbenchPageAdapterInstalled = true;
  window.__tianyuanWorkbenchPageAdapterVersion = ADAPTER_VERSION;

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== REQUEST_TYPE) return;

    let payload;
    try {
      payload = collectContext();
    } catch (error) {
      payload = {
        ok: false,
        reason: "PAGE_ADAPTER_COLLECT_ERROR",
        message: error?.message || String(error),
        collectedAt: new Date().toISOString(),
        url: location.href,
      };
    }

    payload = { ...payload, adapterVersion: ADAPTER_VERSION };
    window.postMessage({ type: RESPONSE_TYPE, requestId: data.requestId, payload }, "*");
  });

  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.type !== ACTION_REQUEST_TYPE) return;

    let payload;
    try {
      payload = await runAction(data.payload || {});
    } catch (error) {
      payload = {
        ok: false,
        reason: "PAGE_ADAPTER_ACTION_ERROR",
        message: error?.message || String(error),
        collectedAt: new Date().toISOString(),
        url: location.href,
      };
    }

    payload = { ...payload, adapterVersion: ADAPTER_VERSION };
    window.postMessage({ type: ACTION_RESPONSE_TYPE, requestId: data.requestId, payload }, "*");
  });
})();
