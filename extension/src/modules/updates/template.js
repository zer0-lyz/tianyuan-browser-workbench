export const updatesTemplate = `
  <div class="page-heading">
    <div>
      <h2>版本更新</h2>
      <p>通过 GitHub Releases 检查天源浏览器工作台更新</p>
    </div>
    <button id="backFromUpdates" type="button" class="secondary">返回首页</button>
  </div>
  <section class="section update-panel">
    <div class="section-title-row">
      <div>
        <h2 id="updateHeadline">正在读取当前版本</h2>
        <p id="updateDescription" class="section-description">更新检查不使用 MCP token，也不会修改当前安装。</p>
      </div>
      <span id="updateBadge" class="badge">未检查</span>
    </div>
    <dl class="kv compact-kv update-version-grid">
      <div><dt>当前版本</dt><dd id="updateCurrentVersion">-</dd></div>
      <div><dt>最新版本</dt><dd id="updateLatestVersion">-</dd></div>
      <div><dt>发布通道</dt><dd id="updateChannel">stable</dd></div>
      <div><dt>当前构建</dt><dd id="updateBuildNumber">-</dd></div>
      <div><dt>目标平台</dt><dd id="updatePlatform">-</dd></div>
      <div><dt>最后检查</dt><dd id="updateCheckedAt">-</dd></div>
    </dl>
    <div id="updateFeedback" class="inline-feedback">尚未检查 GitHub Release</div>
    <div class="button-row">
      <button id="checkForUpdates" type="button">检查更新</button>
      <button id="downloadUpdate" type="button" disabled>下载更新</button>
      <button id="openReleasePage" type="button" class="secondary" disabled>查看发布页</button>
    </div>
  </section>
  <section class="section update-notes-panel">
    <div class="section-title-row">
      <div>
        <h2>更新内容</h2>
        <p class="section-description">下载安装包后仍由本机安装程序完成更新，当前版本不会被静默覆盖。</p>
      </div>
    </div>
    <ul id="updateNotes" class="update-notes">
      <li>等待检查更新</li>
    </ul>
    <dl class="kv compact-kv">
      <div><dt>安装包</dt><dd id="updateAssetName">-</dd></div>
      <div><dt>文件大小</dt><dd id="updateAssetSize">-</dd></div>
      <div><dt>SHA-256</dt><dd id="updateAssetSha">-</dd></div>
    </dl>
  </section>
`;
