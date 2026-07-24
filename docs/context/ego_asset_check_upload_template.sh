#!/usr/bin/env bash
set -euo pipefail

# Tianyuan asset-based approach audit-check attachment upload template.
# Run through ego-browser. Do not convert this into a standalone .js file;
# ego-browser task scripts should stay inside the heredoc body.

export TASK_SPACE="${TASK_SPACE:-tianyuan attachment upload test}"
export PROJECT_ID="${PROJECT_ID:-165353602809858}"
export COMPANY_ID="${COMPANY_ID:-165353602809933}"
export SUBJECT_CODE="${SUBJECT_CODE:-C5-10-3}"
export ROW_NUMBER="${ROW_NUMBER:-2}"
export FIELD_TITLE="${FIELD_TITLE:-查证资料索引}"
export MODULE_INDEX="${MODULE_INDEX:-0}"
export FILE_PATH="${FILE_PATH:-/Users/zer0y/Library/CloudStorage/OneDrive-个人/共享/2026-天源/20260529 中显光电/项目管理/_work/ego_upload_test/ego_upload_test.pdf}"

# Keep this at 0 for real business runs.
# Set to 1 only for capability tests where the browser needs to prove upload mechanics
# while the draft itself is read-only or locked by another user.
export BYPASS_READONLY_FOR_CAPABILITY_TEST="${BYPASS_READONLY_FOR_CAPABILITY_TEST:-0}"

ego-browser nodejs <<'NODESCRIPT'
const cfg = {
  taskSpace: process.env.TASK_SPACE,
  projectId: process.env.PROJECT_ID,
  companyId: process.env.COMPANY_ID,
  subjectCode: process.env.SUBJECT_CODE,
  rowNumber: Number(process.env.ROW_NUMBER || '2'),
  fieldTitle: process.env.FIELD_TITLE || '查证资料索引',
  moduleIndex: Number(process.env.MODULE_INDEX || '0'),
  filePath: process.env.FILE_PATH,
  bypassReadonly: process.env.BYPASS_READONLY_FOR_CAPABILITY_TEST === '1',
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function colName(index) {
  let n = index + 1
  let s = ''
  while (n) {
    const m = (n - 1) % 26
    s = String.fromCharCode(65 + m) + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}

async function waitForSpread() {
  for (let i = 0; i < 60; i++) {
    const ok = await js(String.raw`(() => {
      const host = document.querySelector('.spreadWrapper')
      return !!(window.GC && GC.Spread && host && GC.Spread.Sheets.findControl(host))
    })()`)
    if (ok) return true
    await wait(1)
  }
  throw new Error('SpreadJS workbook not ready')
}

await useOrCreateTaskSpace(cfg.taskSpace)

const url = `https://excel.zhrdc.net/ty/operation/${cfg.projectId}/${cfg.companyId}/asset-based-approach/draft?subjectCode=${cfg.subjectCode}`
await openOrReuseTab(url, { wait: true, timeout: 30 })
await waitForSpread()

await js(String.raw`(() => {
  window.__egoUploadNetworkLog = []
  if (window.__egoUploadNetworkPatched) return
  window.__egoUploadNetworkPatched = true

  const origOpen = XMLHttpRequest.prototype.open
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__egoUploadReq = { type: 'xhr', method, url: String(url), start: Date.now() }
    this.addEventListener('loadend', () => {
      try {
        window.__egoUploadNetworkLog.push({
          ...this.__egoUploadReq,
          status: this.status,
          response: String(this.responseText || '').slice(0, 800),
        })
      } catch {}
    })
    return origOpen.call(this, method, url, ...rest)
  }
})()`)

const prep = await js(`(async () => {
  const cfg = ${JSON.stringify(cfg)}
  const host = document.querySelector('.spreadWrapper')
  const spread = GC.Spread.Sheets.findControl(host)
  const sheet = spread.getActiveSheet()
  const row = cfg.rowNumber - 1

  let col = -1
  for (let c = 0; c < sheet.getColumnCount(); c++) {
    const title = sheet.getText(0, c) || sheet.getValue(0, c)
    if (title === cfg.fieldTitle) {
      col = c
      break
    }
  }
  if (col < 0) {
    return {
      ok: false,
      reason: 'FIELD_NOT_FOUND',
      headers: Array.from({ length: Math.min(sheet.getColumnCount(), 60) }, (_, c) => ({
        col: c,
        title: sheet.getText(0, c) || sheet.getValue(0, c),
      })),
    }
  }

  const cellType = sheet.getCellType(row, col)
  const before = {
    sheetName: sheet.name(),
    row,
    col,
    cell: (${colName.toString()})(col) + cfg.rowNumber,
    title: sheet.getText(0, col) || sheet.getValue(0, col),
    text: sheet.getText(row, col),
    value: sheet.getValue(row, col),
    tag: sheet.getTag(row, col),
    cellType: cellType ? {
      ctor: cellType.constructor && cellType.constructor.name,
      domId: cellType.domId,
      isReadOnly: !!cellType.isReadOnly,
      methods: Object.getOwnPropertyNames(Object.getPrototypeOf(cellType)),
    } : null,
  }

  if (!cellType || typeof cellType.activateEditor !== 'function' || cellType.domId !== 'operation-upload-cell') {
    return { ok: false, reason: 'NOT_UPLOAD_CELL', before }
  }

  if (cellType.isReadOnly && !cfg.bypassReadonly) {
    return { ok: false, reason: 'READONLY_OR_LOCKED', before }
  }

  if (cfg.bypassReadonly) {
    cellType.isReadOnly = false
  }

  sheet.setActiveCell(row, col)
  sheet.setSelection(row, col, 1, 1)
  spread.focus()
  await cellType.activateEditor(true, null, null, { sheet, row, col })
  await new Promise(resolve => setTimeout(resolve, 1200))

  const dialogs = [...document.querySelectorAll('.el-dialog')]
    .filter(d => getComputedStyle(d).display !== 'none')
  const dialog = dialogs[dialogs.length - 1]
  if (!dialog) return { ok: false, reason: 'DIALOG_NOT_OPENED', before }

  const inputs = [...dialog.querySelectorAll('input[type=file]')]
  const usableInputs = inputs.filter(input => !input.disabled)
  if (!usableInputs.length) {
    return {
      ok: false,
      reason: 'NO_ENABLED_FILE_INPUT',
      before,
      dialogText: dialog.innerText.slice(0, 1000),
      inputs: inputs.map((input, i) => ({ i, disabled: input.disabled, accept: input.accept })),
    }
  }

  const target = usableInputs[cfg.moduleIndex] || usableInputs[0]
  target.setAttribute('data-ego-upload-target', '1')
  return {
    ok: true,
    before,
    dialogText: dialog.innerText.slice(0, 1000),
    targetInput: {
      accept: target.accept,
      multiple: target.multiple,
      disabled: target.disabled,
      moduleIndex: cfg.moduleIndex,
    },
  }
})()`)

cliLog('prepare=' + JSON.stringify(prep, null, 2))
if (!prep.ok) {
  cliLog('blocked_before_upload=true')
} else {
  await uploadFile('input[data-ego-upload-target="1"]', cfg.filePath)
  await wait(2)

  const clicked = await js(String.raw`(() => {
    const dialogs = [...document.querySelectorAll('.el-dialog')]
      .filter(d => getComputedStyle(d).display !== 'none')
    const dialog = dialogs[dialogs.length - 1]
    if (!dialog) return { ok: false, reason: 'DIALOG_CLOSED' }
    const btn = [...dialog.querySelectorAll('button')].find(b => b.innerText.trim() === '保存')
    if (!btn) return { ok: false, reason: 'SAVE_BUTTON_NOT_FOUND', dialogText: dialog.innerText.slice(0, 1000) }
    btn.click()
    return { ok: true, dialogText: dialog.innerText.slice(0, 1000) }
  })()`)
  cliLog('saveClick=' + JSON.stringify(clicked, null, 2))
  await wait(8)

  const result = await js(`(() => {
    const cfg = ${JSON.stringify(cfg)}
    const host = document.querySelector('.spreadWrapper')
    const spread = GC.Spread.Sheets.findControl(host)
    const sheet = spread.getActiveSheet()
    const row = cfg.rowNumber - 1
    let col = -1
    for (let c = 0; c < sheet.getColumnCount(); c++) {
      const title = sheet.getText(0, c) || sheet.getValue(0, c)
      if (title === cfg.fieldTitle) { col = c; break }
    }
    return {
      network: (window.__egoUploadNetworkLog || [])
        .filter(x => /attach|upload|assignment_draft/.test(x.url || ''))
        .slice(-30),
      cell: col >= 0 ? {
        row,
        col,
        cell: (${colName.toString()})(col) + cfg.rowNumber,
        text: sheet.getText(row, col),
        value: sheet.getValue(row, col),
        tag: sheet.getTag(row, col),
      } : null,
      messages: [...document.querySelectorAll('.el-message, .el-notification')]
        .map(m => m.innerText)
        .slice(-10),
    }
  })()`)
  cliLog('result=' + JSON.stringify(result, null, 2))
}
NODESCRIPT
