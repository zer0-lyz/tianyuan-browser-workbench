export const declarationTableWorkflowTemplate = `
  <div class="page-heading declaration-table-workflow-heading">
    <div>
      <h2>申报表导出与整理</h2>
      <p>选择公司后导出申报表，并自动设置打印格式</p>
    </div>
    <button id="declarationTableWorkflowBack" type="button" class="secondary">功能中心</button>
  </div>

  <div id="declareScopeMount" class="page-mount"></div>

  <section class="section declaration-table-workflow-panel">
    <div class="section-title-row">
      <div><h2>处理模式</h2><p class="section-description">自动模式直接整理新导出的申报表；手动模式处理已有工作簿。</p></div>
      <span class="badge">统一流程</span>
    </div>
    <label class="declaration-table-workflow-mode-card">
      <input id="declarationTableWorkflowModeAfterExport" type="radio" name="declarationTableWorkflowMode" value="after_export">
      <span><strong>导出后自动整理</strong><small>导出 → 设置申报表打印格式，不额外创建中间副本。</small></span>
    </label>
    <label class="declaration-table-workflow-mode-card">
      <input id="declarationTableWorkflowModeManual" type="radio" name="declarationTableWorkflowMode" value="manual_files">
      <span><strong>选择文件/文件夹手动整理</strong><small>对已有 .xlsx/.xlsm 文件设置申报表打印格式。</small></span>
    </label>
  </section>

  <section id="declarationTableWorkflowManualPanel" class="section declaration-table-workflow-panel">
    <div class="section-title-row"><h2>手动输入</h2><span id="declarationTableWorkflowInputSummary" class="badge">尚未选择</span></div>
    <div class="button-row"><button id="chooseDeclarationTableWorkflowFiles" type="button" class="secondary">选择文件</button><button id="chooseDeclarationTableWorkflowFolder" type="button" class="secondary">选择文件夹</button></div>
    <label class="field-block"><span>处理后文件</span><select id="declarationTableWorkflowOutputMode"><option value="copy_in_source">在原文件夹创建整理副本</option><option value="overwrite">直接覆盖原文件</option><option value="new_directory">保存到新的文件夹</option></select></label>
    <div id="declarationTableWorkflowOutputDirectoryWrap" class="directory-field hidden"><span>新的输出文件夹</span><div class="directory-row"><input id="declarationTableWorkflowOutputDirectory" type="text" readonly placeholder="请选择本机文件夹"><button id="chooseDeclarationTableWorkflowOutput" type="button" class="secondary">选择</button></div></div>
  </section>

  <section id="declarationTableWorkflowExportDirectoryPanel" class="section declaration-table-workflow-panel">
    <h2>导出存放路径</h2>
    <div class="directory-row"><input id="declarationTableWorkflowExportDirectory" type="text" readonly placeholder="自动模式请选择本机文件夹"><button id="chooseDeclarationTableWorkflowExportDirectory" type="button" class="secondary">选择</button></div>
  </section>

  <section class="section declaration-table-workflow-panel">
    <div class="export-progress" aria-live="polite"><div class="progress-heading"><span id="declarationTableWorkflowProgressText">等待执行</span><strong id="declarationTableWorkflowProgressPercent">0%</strong></div><progress id="declarationTableWorkflowProgressBar" max="100" value="0"></progress></div>
    <div class="task-actions"><button id="runDeclarationTableWorkflow" type="button">开始导出与整理</button></div>
    <ul id="declarationTableWorkflowResultList" class="declaration-table-workflow-result-list" aria-live="polite"></ul>
    <div class="button-row"><button id="resetDeclarationTableWorkflow" type="button" class="secondary">恢复推荐设置</button><button id="saveDeclarationTableWorkflow" type="button" class="secondary">保存设置</button></div>
  </section>

  <div id="declareSupportMount" class="page-mount"></div>
`;
