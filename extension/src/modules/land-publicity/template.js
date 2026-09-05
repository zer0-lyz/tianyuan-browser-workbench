export const landPublicityTemplate = `
  <div class="page-heading">
    <div>
      <h2>浙江土地成交公示</h2>
      <p>抓取浙江省自然资源网上交易系统成交公示，输出 Excel 和独立 HTML 结果页</p>
    </div>
    <button id="backFromLandPublicity" type="button" class="secondary">返回首页</button>
  </div>

  <section class="section land-publicity-notice">
    <div class="inline-feedback" data-kind="warn">
      交易条件固定为国有土地、挂牌出让/拍卖出让、结果公示；行政区和官网查询日期会直接用于列表查询。
    </div>
  </section>

  <section class="section land-publicity-filters">
    <div class="section-title-row"><div><h2>交易条件</h2><p class="section-description">本模块按成交公示场景固定条件，无需重复选择。</p></div></div>
    <div class="land-publicity-fixed-conditions" aria-label="固定交易条件">
      <div class="land-publicity-fixed-condition"><span>交易形式</span><strong>国有土地</strong></div>
      <div class="land-publicity-fixed-condition"><span>交易方式</span><strong>挂牌出让、拍卖出让</strong></div>
      <div class="land-publicity-fixed-condition"><span>交易阶段</span><strong>结果公示</strong></div>
    </div>
  </section>

  <section class="section land-publicity-filters">
    <div class="section-title-row"><div><h2>行政区域</h2><p class="section-description">行政区从官网自动加载；未选择地市、区县且未填写关键词时，按全省查询。</p></div><button id="reloadLandPublicityRegions" type="button" class="secondary land-publicity-region-refresh" title="刷新行政区列表" aria-label="刷新行政区列表">刷新</button></div>
    <div class="land-publicity-field-grid land-publicity-administrative-fields">
      <label class="field-block"><span>地市</span><select id="landPublicityDistrict"><option value="">正在加载地市…</option></select></label>
      <label class="field-block"><span>区县</span><select id="landPublicityCounty" disabled><option value="">请先选择地市</option></select></label>
      <label class="field-block"><span>位置关键词（可选）</span><input id="landPublicityLocation" type="text" maxlength="160" placeholder="例如：街道、村、道路或交叉口"></label>
    </div>
    <p id="landPublicityRegionStatus" class="section-description land-publicity-region-status" role="status">正在从官网加载行政区…</p>
  </section>

  <section class="section land-publicity-filters">
    <div class="section-title-row"><div><h2>土地用途</h2><p class="section-description">可多选；不选择表示不按用途限制。</p></div></div>
    <fieldset class="land-publicity-option-group land-publicity-use-group">
      <legend>选择用途</legend>
      <label><input type="checkbox" name="landUse" value="住宅用地"><span>住宅用地</span></label>
      <label><input type="checkbox" name="landUse" value="商服用地"><span>商服用地</span></label>
      <label><input type="checkbox" name="landUse" value="工矿仓储"><span>工矿仓储</span></label>
      <label><input type="checkbox" name="landUse" value="其他用地"><span>其他用地</span></label>
    </fieldset>
  </section>

  <section class="section land-publicity-filters">
    <div class="section-title-row"><div><h2>报价开始时间范围</h2><p class="section-description">对应官网“报价开始时间”筛选；不填写表示不限，结果表另列成交公示发布时间。</p></div></div>
    <div class="land-publicity-date-range">
      <label class="field-block"><span>起始日期（可选）</span><input id="landPublicityStartDate" type="date"></label>
      <label class="field-block"><span>结束日期（可选）</span><input id="landPublicityEndDate" type="date"></label>
    </div>
  </section>

  <section class="section land-publicity-output">
    <div class="section-title-row"><div><h2>输出位置</h2><p class="section-description">选择上级目录后，系统会自动创建“浙江土地成交公示”子文件夹存放结果。</p></div></div>
    <div class="land-publicity-output-row"><input id="landPublicityOutputDirectory" type="text" readonly placeholder="请选择本机输出目录"><button id="chooseLandPublicityOutput" type="button" class="secondary">选择目录</button></div>
    <label class="field-block land-publicity-map-option"><span>附加输出</span><span><input id="landPublicityGenerateMap" type="checkbox"> 生成独立地图 HTML</span></label>
  </section>

  <section class="section land-publicity-run">
    <div class="section-title-row"><div><h2>执行与进度</h2><p id="landPublicityProgressText" class="section-description">尚未运行</p></div><span id="landPublicityProgressPercent" class="badge">0%</span></div>
    <div class="progress-track"><div id="landPublicityProgressBar" class="progress-value" style="width:0%"></div></div>
    <div class="land-publicity-progress-counts"><span>已抓取 <strong id="landPublicityFetchedCount">0</strong></span><span>已筛选 <strong id="landPublicityFilteredCount">0</strong></span><span>已写出 <strong id="landPublicityWrittenCount">0</strong></span></div>
    <div class="button-row"><button id="runLandPublicity" type="button">开始抓取</button><button id="clearLandPublicityFilters" type="button" class="secondary">清空筛选</button><button id="openLandPublicityHtml" type="button" class="secondary" disabled>打开结果页</button><button id="openLandPublicityExcel" type="button" class="secondary" disabled>打开 Excel</button><button id="openLandPublicityMap" type="button" class="secondary" disabled>查看地图</button></div>
    <div id="landPublicityResultMessage" class="inline-feedback">完成后将回读 Excel、HTML 及可选地图文件；无坐标案例会在表格中明确标注。</div>
  </section>
`;
