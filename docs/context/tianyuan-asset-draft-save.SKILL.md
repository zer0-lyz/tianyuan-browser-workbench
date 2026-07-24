---
name: "tianyuan-asset-draft-save（天源资产底稿保存）"
description: 中文备注：天源资产基础法底稿保存。Use when the user asks to enter Tianyuan/ZHRDC asset-based approach drafts, click 保存 after declaration/detail import, refresh company summary, or verify whether imported asset-based draft data has flowed into the 汇总表/报表数校对.
---

# 天源资产基础法底稿保存

## Purpose

Use this skill to perform the Tianyuan web UI save step that makes imported asset-based approach draft data flow into the company summary table. This is for cases where API import/readback shows rows exist but the asset-based summary still has zero or stale `bookValue`/`appraisedValue`.

## Inputs

- `projectId`: Tianyuan project ID.
- `companyId`: target company ID.
- Target company name/code for human verification.
- Optional `subjectCodes`: asset-based subject codes to open and save, such as `C3-1-2,C3-5,C5-5`.
- Optional `reportDate`/base date for summary verification.
- Optional `selectAllCompanies`: whether to click `公司主体` -> `选择更多` -> `全选` -> `确定` before saving subjects.

If only a company code such as `1-11` is given, first resolve the exact `companyId` from Tianyuan company list or prior verified context. Do not guess company IDs.

## Workflow

1. Confirm the business meaning before acting:
   - You are not changing imported detail values manually.
   - You are opening the online asset-based draft and clicking `保存` so formulas and summary values recalculate.
2. Prefer the existing Tianyuan plugin/`tycpv`/MCP tools for project/company lookup and final summary readback.
3. Use the web UI for the save action because the controlled MCP export API may not expose `/assignment_draft/save`.
4. Open the direct draft URL:
   - `https://excel.zhrdc.net/ty/operation/<projectId>/<companyId>/asset-based-approach/draft`
   - Add `?subjectCode=<subjectCode>` when saving a specific subject.
5. Verify the page before saving:
   - Page text includes `<company short name> - 资产基础法底稿`.
   - Page text includes `基准日` and `保存`.
   - URL includes `/ty/operation/<projectId>/<companyId>/asset-based-approach/draft`.
6. For batch efficiency, optionally select all company subjects before saving each subject:
   - Click the upper-left `公司主体` area link `选择更多`.
   - In the popup, click `全选`.
   - Click `确定`.
   - Verify the popup closes before saving the current subject.
7. Click `保存`.
8. Treat page text containing `保存成功` as immediate evidence, but always verify by refreshing and reading the company summary.
9. If one subject save only updates that subject, open and save every imported subject code for that company.

## Automation Script

Use `scripts/save_asset_draft.js` when Chrome can be controlled through DevTools.

Example:

```bash
node /Users/lin/codex-skills/skills/tianyuan-asset-draft-save/scripts/save_asset_draft.js \
  --project-id 166983428210689 \
  --company-id 166984839725068 \
  --subject-codes C3-1-2,C3-5,C3-7,C3-8-3,C5-5 \
  --select-all-companies
```

If Chrome was not started with a DevTools port, either:

- start Chrome manually with `--remote-debugging-port=9222`, or
- pass `--restart-chrome` to let the script quit and reopen Chrome.

Recommended restart example:

```bash
node /Users/lin/codex-skills/skills/tianyuan-asset-draft-save/scripts/save_asset_draft.js \
  --project-id <projectId> \
  --company-id <companyId> \
  --subject-codes <comma-separated-codes> \
  --select-all-companies \
  --restart-chrome
```

The script assumes the user is already logged in to Tianyuan in the selected Chrome profile. It must not print cookies, tokens, passwords, OTPs, or private account details.

Use `--select-all-companies` only when the intended operation is to save each subject across all company subjects visible in the popup. The script re-applies this selection after every subject navigation because Tianyuan resets the company-subject selection when the draft URL reloads. Omit it for a strict single-company save.

## Verification

After saving, call Tianyuan summary readback. Preferred checks:

- Refresh: `request_detail_table_export_api` with `GET /summary/company/refresh`.
- Read: `get_company_asset_based_approach_summary`.
- Confirm `bookValue`/`appraisedValue` are no longer stale zero values for saved subjects.
- Report remaining differences by subject code, subject name, draft book value, statement value, and difference.

When differences remain, distinguish these from save failure. Common real differences:

- Statement amount belongs to a different subject than imported draft detail.
- Negative tax or reclassification amount offsets another statement line.
- Interest is classified under `一年内到期的非流动负债` in the statement but under `其他应付款` in the draft.
- Net value versus original cost basis differs, such as `使用权资产`.

## Failure Handling

- If Chrome says AppleScript JavaScript execution is disabled, use DevTools remote debugging instead of AppleScript page JS.
- If screen capture is black or accessibility sees only the Chrome shell, do not guess coordinates.
- If `curl https://excel.zhrdc.net` times out locally, do not rely on direct backend HTTP from the shell; use browser-controlled DevTools.
- If the page shows login text instead of `资产基础法底稿`, stop and ask the user to log in.
- If a subject URL opens but no `保存` button appears, read the page text and verify permissions/edit lock state.
- If `选择更多`/`全选`/`确定` cannot be found, stop before saving and report the visible page text/buttons. Do not proceed with a guessed company scope.

## Evidence Pattern

Successful run evidence should include:

- Company and project identifiers.
- Draft URL reached.
- Whether all company subjects were selected.
- Subject codes saved.
- Whether `保存成功` appeared.
- Summary refresh result.
- Final remaining differences, if any.
