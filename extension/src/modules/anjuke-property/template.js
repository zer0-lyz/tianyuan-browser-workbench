export const anjukePropertyTemplate = `
  <div class="page-heading anjuke-property-heading">
    <div>
      <h2>安居客数据</h2>
      <p>先在安居客网页中选好区域和筛选条件，再导入当前网址并开始抓取。</p>
    </div>
    <button id="backFromAnjukeProperty" type="button" class="secondary">返回首页</button>
  </div>

  <section class="section anjuke-property-params">
    <div class="section-title-row">
      <div><h2>抓取设置</h2><p class="section-description">网页筛选条件以安居客当前页面为准，插件只读取当前网址。</p></div>
      <span id="anjukePropertyParameterState" class="badge" data-kind="pending">未导入网址</span>
    </div>
    <div class="anjuke-property-current-url-row">
      <label><span>当前网址</span><input id="anjukePropertyCurrentUrl" type="url" readonly placeholder="请先在安居客网页中选择范围"></label>
      <button id="importAnjukePropertyCurrentUrl" type="button">导入当前网址</button>
    </div>
    <div class="form-grid anjuke-property-parameter-grid">
      <label><span>案例类型</span><select id="anjukePropertyCaseType"><option value="auto">自动识别</option><option value="sale">出售</option><option value="rent">租赁</option></select></label>
      <label><span>最多案例数</span><input id="anjukePropertyMaxCases" type="number" min="1" max="100" value="10"></label>
    </div>
    <div class="anjuke-property-options">
      <label><input id="anjukePropertyWaitVerification" type="checkbox" checked> 遇验证时等待人工完成</label>
      <label><input id="anjukePropertyScreenshot" type="checkbox" disabled> 保存全页截图（当前标签页模式暂不支持）</label>
    </div>
    <div class="button-row anjuke-property-parameter-actions">
      <button id="runAnjukeProperty" type="button">开始抓取</button>
      <button id="resetAnjukePropertyParams" type="button" class="secondary">清除当前网址</button>
    </div>
    <div id="anjukePropertyParameterMessage" class="inline-feedback">请在安居客网页中选好范围，再点击“导入当前网址”。</div>
  </section>

  <section class="section anjuke-property-output">
    <div class="section-title-row"><div><h2>输出位置</h2><p class="section-description">选择上级目录后，系统自动创建“安居客物业案例”子文件夹。</p></div></div>
    <div class="anjuke-property-output-row"><input id="anjukePropertyOutputDirectory" type="text" readonly placeholder="请选择本机输出目录"><button id="chooseAnjukePropertyOutput" type="button" class="secondary">选择目录</button></div>
    <p id="anjukePropertyProfileHint" class="section-description">抓取运行在本机受控浏览器中，不保存登录凭据到项目。</p>
  </section>

  <section class="section anjuke-property-results">
    <div class="section-title-row"><div><h2>抓取结果</h2><p class="section-description">只有输出文件回读通过后才报告成功。</p></div><span id="anjukePropertyResultCount" class="badge">0 条</span></div>
    <div class="anjuke-property-result-toolbar"><span id="anjukePropertyResultStatus" class="section-description">尚未读取结果</span><div class="button-row"><button id="openAnjukePropertyResult" type="button" class="secondary" disabled>打开结果表格</button><button id="openAnjukePropertyMap" type="button" class="secondary" disabled>查看地图</button><button id="openAnjukePropertyExcel" type="button" class="secondary" disabled>打开 Excel</button><button id="openAnjukePropertyCsv" type="button" class="secondary" disabled>打开 CSV</button><button id="openAnjukePropertyHtml" type="button" class="secondary" disabled>打开原始网页目录</button><button id="clearAnjukePropertyResults" type="button" class="tiny secondary" disabled>清空结果</button></div></div>
    <div class="anjuke-property-progress" aria-live="polite"><div class="anjuke-property-progress-heading"><span id="anjukePropertyProgressPhase">等待开始</span><strong id="anjukePropertyProgressPercent">0%</strong></div><div class="anjuke-property-progress-track" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><div id="anjukePropertyProgressBar" class="anjuke-property-progress-value" style="width:0%"></div></div><div class="anjuke-property-progress-counts"><span>候选 <strong id="anjukePropertyProgressFetched">0</strong></span><span>已归档 <strong id="anjukePropertyProgressWritten">0</strong></span></div></div>
    <div id="anjukePropertyResultMessage" class="inline-feedback">结果包含 result.html、map.html、cases.csv、cases.json、cases.xlsx 和原始 HTML；截图按需保存。</div>
  </section>
`;
