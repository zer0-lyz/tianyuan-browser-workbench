export const detailTableWorkflowTemplate = `
  <div class="page-heading detail-table-workflow-heading">
    <div>
      <h2>明细表导出与整理</h2>
      <p>选择公司后导出明细表，并按设置自动恢复公式和整理格式</p>
    </div>
    <button id="backFromExportDetail" type="button" class="secondary">功能中心</button>
  </div>

  <div id="detailScopeMount" class="page-mount"></div>

  <section class="section detail-table-workflow-panel">
    <div class="section-title-row">
      <div>
        <h2>处理模式</h2>
        <p class="section-description">自动模式直接整理新导出的文件；手动模式处理已有工作簿。</p>
      </div>
      <span class="badge">统一流程</span>
    </div>
    <label class="detail-table-workflow-mode-card">
      <input id="detailTableWorkflowModeAfterExport" type="radio" name="detailTableWorkflowMode" value="after_export">
      <span><strong>导出后自动整理</strong><small>导出 → 恢复公式 → 设置明细表格式，不额外创建中间副本。</small></span>
    </label>
    <label class="detail-table-workflow-mode-card">
      <input id="detailTableWorkflowModeManual" type="radio" name="detailTableWorkflowMode" value="manual_files">
      <span><strong>选择文件/文件夹手动整理</strong><small>对已有 .xlsx/.xlsm 文件执行选定的整理步骤。</small></span>
    </label>
  </section>

  <section class="section detail-table-workflow-panel">
    <div class="section-title-row"><h2>整理内容</h2><span id="detailTableWorkflowMessage" class="inline-feedback">请选择处理模式。</span></div>
    <label class="check-row"><input id="detailTableWorkflowRestoreFormulas" type="checkbox"><span><strong>恢复明细表公式</strong><small>恢复跨表汇总链接，并保留脚本校验结果。</small></span></label>
    <label class="check-row"><input id="detailTableWorkflowApplyFormat" type="checkbox"><span><strong>设置明细表格式</strong><small>沿用现有明细表打印格式规则，逐个文件校验后提交。</small></span></label>
  </section>

  <section id="detailTableWorkflowManualPanel" class="section detail-table-workflow-panel">
    <div class="section-title-row"><h2>手动输入</h2><span id="detailTableWorkflowInputSummary" class="badge">尚未选择</span></div>
    <div class="button-row">
      <button id="chooseDetailTableWorkflowFiles" type="button" class="secondary">选择文件</button>
      <button id="chooseDetailTableWorkflowFolder" type="button" class="secondary">选择文件夹</button>
    </div>
    <label class="field-block"><span>处理后文件</span><select id="detailTableWorkflowOutputMode"><option value="copy_in_source">在原文件夹创建整理副本</option><option value="overwrite">直接覆盖原文件</option><option value="new_directory">保存到新的文件夹</option></select></label>
    <div id="detailTableWorkflowOutputDirectoryWrap" class="directory-field hidden"><span>新的输出文件夹</span><div class="directory-row"><input id="detailTableWorkflowOutputDirectory" type="text" readonly placeholder="请选择本机文件夹"><button id="chooseDetailTableWorkflowOutput" type="button" class="secondary">选择</button></div></div>
  </section>

  <section id="detailTableWorkflowExportDirectoryPanel" class="section detail-table-workflow-panel">
    <h2>导出存放路径</h2>
    <div class="directory-row"><input id="detailTableWorkflowExportDirectory" type="text" readonly placeholder="自动模式请选择本机文件夹"><button id="chooseDetailTableWorkflowExportDirectory" type="button" class="secondary">选择</button></div>
    <div class="export-progress" aria-live="polite"><div class="progress-heading"><span id="detailTableWorkflowProgressText">等待执行</span><strong id="detailTableWorkflowProgressPercent">0%</strong></div><progress id="detailTableWorkflowProgressBar" max="100" value="0"></progress></div>
    <div class="task-actions"><button id="runExportDetail" type="button">开始导出与整理</button></div>
    <ul id="detailTableWorkflowResultList" class="detail-table-workflow-result-list" aria-live="polite"></ul>
    <div class="button-row"><button id="resetDetailTableWorkflow" type="button" class="secondary">恢复推荐设置</button><button id="saveDetailTableWorkflow" type="button" class="secondary">保存设置</button></div>
  </section>

  <div id="detailSupportMount" class="page-mount"></div>
  <div hidden aria-hidden="true">
    <input id="detailOutputPath" type="text">
    <button id="chooseDetailOutputPath" type="button">兼容入口</button>
    <progress id="detailProgressBar" max="100" value="0"></progress>
    <span id="detailProgressText"></span>
    <span id="detailProgressPercent"></span>
  </div>
`;
