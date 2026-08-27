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
      列表 API 只支持分页读取；行政区、交易方式、交易阶段、土地用途、报价时间和价格/面积区间均在抓取后筛选。默认限制抓取页数，避免无确认全量抓取。
    </div>
  </section>

  <section class="section land-publicity-filters">
    <div class="section-title-row"><div><h2>交易条件</h2><p class="section-description">选项只作为本次任务参数，不会伪装成服务器端查询参数。</p></div></div>
    <div class="land-publicity-field-grid">
      <fieldset class="land-publicity-option-group">
        <legend>交易形式</legend>
        <label><input type="radio" name="landTradeForm" value="国有土地"><span>国有土地</span></label>
        <label><input type="radio" name="landTradeForm" value="国有土地（组合）"><span>国有土地（组合）</span></label>
        <label><input type="radio" name="landTradeForm" value=""><span>不限</span></label>
      </fieldset>
      <fieldset class="land-publicity-option-group">
        <legend>交易方式</legend>
        <label><input type="checkbox" name="landTradeMethod" value="挂牌出让"><span>挂牌出让</span></label>
        <label><input type="checkbox" name="landTradeMethod" value="挂牌租赁"><span>挂牌租赁</span></label>
        <label><input type="checkbox" name="landTradeMethod" value="拍卖出让"><span>拍卖出让</span></label>
        <label><input type="checkbox" name="landTradeMethod" value="拍卖租赁"><span>拍卖租赁</span></label>
      </fieldset>
      <fieldset class="land-publicity-option-group">
        <legend>交易阶段</legend>
        <label title="当前 Skill 的 type=3 接口仅抓取结果公示"><input type="checkbox" name="landTradeStage" value="结果公示"><span>结果公示</span></label>
        <label title="当前成交公示 Skill 不抓取此阶段"><input type="checkbox" disabled><span>公告期</span></label>
        <label title="当前成交公示 Skill 不抓取此阶段"><input type="checkbox" disabled><span>挂牌期</span></label>
        <label title="当前成交公示 Skill 不抓取此阶段"><input type="checkbox" disabled><span>竞价期</span></label>
        <label title="当前成交公示 Skill 不抓取此阶段"><input type="checkbox" disabled><span>交易结束</span></label>
      </fieldset>
    </div>
  </section>

  <section class="section land-publicity-filters">
    <div class="land-publicity-field-grid">
      <label class="field-block"><span>行政区</span><input id="landPublicityDistrict" type="text" list="landPublicityDistrictOptions" maxlength="100" placeholder="选择地市或输入区县">
        <datalist id="landPublicityDistrictOptions"><option>杭州市</option><option>宁波市</option><option>温州市</option><option>湖州市</option><option>嘉兴市</option><option>绍兴市</option><option>金华市</option><option>衢州市</option><option>舟山市</option><option>台州市</option><option>丽水市</option></datalist>
      </label>
      <label class="field-block land-publicity-check-field"><span>行政区范围</span><span><input id="landPublicityProvinceWide" type="checkbox"> 全省/不限制行政区</span></label>
      <p class="section-description land-publicity-district-help">地市按 districtCode 前四位匹配：杭州 3301、宁波 3302、温州 3303、嘉兴 3304、湖州 3305、绍兴 3306、金华 3307、衢州 3308、舟山 3309、台州 3310、丽水 3311；区县按 districtName 匹配，可勾选精确匹配。</p>
      <label class="field-block"><span>位置关键词（抓取后）</span><input id="landPublicityLocation" type="text" maxlength="160" placeholder="例如：镇海区、滨江街道"></label>
      <label class="field-block land-publicity-check-field"><span>districtName 匹配</span><span><input id="landPublicityDistrictExact" type="checkbox"> 精确匹配</span></label>
      <fieldset class="land-publicity-option-group land-publicity-use-group">
        <legend>土地用途</legend>
        <label><input type="checkbox" name="landUse" value="住宅用地"><span>住宅用地</span></label>
        <label><input type="checkbox" name="landUse" value="商服用地"><span>商服用地</span></label>
        <label><input type="checkbox" name="landUse" value="工矿仓储"><span>工矿仓储</span></label>
        <label><input type="checkbox" name="landUse" value="其他用地"><span>其他用地</span></label>
      </fieldset>
    </div>
  </section>

  <section class="section land-publicity-filters">
    <div class="land-publicity-field-grid">
      <div class="field-block"><span>成交公示起始日期 / 年份（二选一）</span><div class="land-publicity-inline-fields"><input id="landPublicityStartDate" type="date"><input id="landPublicityStartYear" type="number" min="1900" max="2100" placeholder="例如 2025"></div></div>
      <label class="field-block"><span>报价开始时间快捷范围</span><select id="landPublicityQuotePreset"><option value="all">不限</option><option value="today">今天</option><option value="future_3_days">未来三天</option><option value="future_7_days">未来七天</option><option value="future_30_days">未来三十天</option><option value="custom">自定义日期</option></select></label>
      <div class="field-block"><span>报价开始时间（自定义）</span><div class="land-publicity-inline-fields"><input id="landPublicityQuoteStartDate" type="date"><input id="landPublicityQuoteEndDate" type="date"></div></div>
      <label class="field-block"><span>抓取页数上限</span><select id="landPublicityMaxPages"><option value="1">1 页（仅连通性测试）</option><option value="5">5 页</option><option value="10">10 页</option><option value="20">20 页</option><option value="50">50 页（行政区推荐）</option><option value="200">200 页（人工确认）</option></select></label>
    </div>
  </section>

  <section class="section land-publicity-filters">
    <div class="land-publicity-field-grid">
      <div class="field-block"><span>起始价区间（按详情原始数值）</span><div class="land-publicity-inline-fields"><input id="landPublicityStartPriceMin" type="number" min="0" step="0.01" placeholder="最低"><input id="landPublicityStartPriceMax" type="number" min="0" step="0.01" placeholder="最高"></div></div>
      <div class="field-block"><span>出让面积区间</span><div class="land-publicity-inline-fields"><input id="landPublicityAreaMin" type="number" min="0" step="0.01" placeholder="最低"><input id="landPublicityAreaMax" type="number" min="0" step="0.01" placeholder="最高"></div></div>
      <label class="field-block"><span>面积单位</span><select id="landPublicityAreaUnit"><option value="sqm">平方米</option><option value="mu">亩</option></select></label>
      <label class="field-block land-publicity-check-field"><span>地图与结果</span><span><input id="landPublicityGenerateMap" type="checkbox"> 生成独立地图 HTML</span></label>
    </div>
  </section>

  <section class="section land-publicity-output">
    <div class="section-title-row"><div><h2>输出位置</h2><p class="section-description">Excel、结果 HTML 和可选地图会写入同一目录；不会覆盖已有文件。</p></div></div>
    <div class="land-publicity-output-row"><input id="landPublicityOutputDirectory" type="text" readonly placeholder="请选择本机输出目录"><button id="chooseLandPublicityOutput" type="button" class="secondary">选择目录</button></div>
  </section>

  <section class="section land-publicity-run">
    <div class="section-title-row"><div><h2>执行与进度</h2><p id="landPublicityProgressText" class="section-description">尚未运行</p></div><span id="landPublicityProgressPercent" class="badge">0%</span></div>
    <div class="progress-track"><div id="landPublicityProgressBar" class="progress-value" style="width:0%"></div></div>
    <div class="land-publicity-progress-counts"><span>已抓取 <strong id="landPublicityFetchedCount">0</strong></span><span>已筛选 <strong id="landPublicityFilteredCount">0</strong></span><span>已写出 <strong id="landPublicityWrittenCount">0</strong></span></div>
    <div class="button-row"><button id="runLandPublicity" type="button">开始抓取</button><button id="clearLandPublicityFilters" type="button" class="secondary">清空筛选</button><button id="openLandPublicityHtml" type="button" class="secondary" disabled>打开结果页</button><button id="openLandPublicityExcel" type="button" class="secondary" disabled>打开 Excel</button><button id="openLandPublicityMap" type="button" class="secondary" disabled>查看地图</button></div>
    <div id="landPublicityResultMessage" class="inline-feedback">完成后将回读 Excel、HTML 及可选地图文件；无坐标案例会在表格中明确标注。</div>
  </section>
`;
