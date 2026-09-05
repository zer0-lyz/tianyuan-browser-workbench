export const tableFormatTemplate = `
  <div class="page-heading">
    <div>
      <h2>表格设置</h2>
      <p>批量统一 Word 文档中全部表格的字体、对齐、行高和边框</p>
    </div>
    <button id="backFromTableFormat" type="button" class="secondary">功能中心</button>
  </div>

  <section class="section table-format-panel">
    <div class="section-title-row">
      <div>
        <h2>格式预设</h2>
        <p class="section-description">会处理文档内的所有表格，包括表格中的嵌套表格。原文件只会在处理成功并校验通过后替换。</p>
      </div>
      <span class="badge">Word</span>
    </div>
    <div class="table-format-preset" aria-label="表格格式预设">
      <span>宋体文本</span><span>Times New Roman 数字</span><span>10 号字</span><span>按窗口调整</span>
      <span>最小行高 0.6 厘米</span><span>重复标题行</span><span>标题加粗居中</span><span>数字右对齐</span>
      <span>上下线 1.5 磅</span><span>内部线 0.5 磅</span><span>左右无线</span>
    </div>
  </section>

  <section class="section table-format-panel">
    <div class="section-title-row">
      <div>
        <h2>选择 Word 文档</h2>
        <p class="section-description">支持一次选择一个或多个 .docx 文件。暂不处理旧式 .doc 文件。</p>
      </div>
      <span id="tableFormatInputCount" class="badge">未选择</span>
    </div>
    <div class="button-row">
      <button id="chooseTableFormatFiles" type="button" class="secondary">选择 Word 文档</button>
      <button id="clearTableFormatFiles" type="button" class="tiny secondary" disabled>清空选择</button>
    </div>
    <ul id="tableFormatFileList" class="table-format-file-list" aria-live="polite">
      <li class="muted">尚未选择文件</li>
    </ul>
  </section>

  <section class="section table-format-panel">
    <div class="section-title-row">
      <div>
        <h2>输出方式</h2>
        <p class="section-description">覆盖模式会先生成临时文件，成功后再替换原文件。</p>
      </div>
    </div>
    <label class="field-block">
      <span>处理后文件</span>
      <select id="tableFormatOutputMode">
        <option value="copy_in_source">在原文件夹创建副本</option>
        <option value="overwrite">直接覆盖原文件</option>
        <option value="new_directory">保存到指定文件夹</option>
      </select>
    </label>
    <div id="tableFormatOutputDirectoryWrap" class="directory-field hidden">
      <span>目标文件夹</span>
      <div class="directory-row">
        <input id="tableFormatOutputDirectory" type="text" readonly placeholder="请选择本机文件夹">
        <button id="chooseTableFormatOutput" type="button" class="secondary">选择</button>
      </div>
    </div>
  </section>

  <section class="section table-format-panel table-format-run-panel">
    <div class="section-title-row">
      <div>
        <h2>执行与进度</h2>
        <p id="tableFormatProgressText" class="section-description">等待选择文件</p>
      </div>
      <strong id="tableFormatProgressPercent">0%</strong>
    </div>
    <progress id="tableFormatProgressBar" max="100" value="0"></progress>
    <div class="table-format-counts" aria-live="polite">
      <span>总文件 <strong id="tableFormatTotalCount">0</strong></span>
      <span>已完成 <strong id="tableFormatSuccessCount">0</strong></span>
      <span>失败 <strong id="tableFormatFailedCount">0</strong></span>
    </div>
    <div id="tableFormatResultMessage" class="inline-feedback">尚未执行</div>
    <ul id="tableFormatResultList" class="table-format-result-list" aria-live="polite"></ul>
    <div class="task-actions">
      <button id="runTableFormat" type="button">开始执行</button>
    </div>
  </section>
`;
