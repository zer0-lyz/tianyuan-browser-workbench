export const fileArchiveTemplate = `
  <div class="page-heading">
    <div>
      <h2>微信文件归档</h2>
      <p>监听已完成下载文件，复制到本机指定目录并校验完整性</p>
    </div>
    <button id="backFromFileArchive" type="button" class="secondary">返回首页</button>
  </div>

  <section class="section file-archive-config">
    <div class="section-title-row">
      <div>
        <h2>来源应用</h2>
        <p class="section-description">第一阶段只读取本机已授权目录，不修改微信或企业微信原始文件。</p>
      </div>
      <span id="fileArchiveAppStatus" class="badge">未检测</span>
    </div>
    <div class="file-archive-apps">
      <label class="file-archive-app-option">
        <input id="fileArchiveSourceWechat" type="radio" name="fileArchiveSourceApp" value="wechat" checked>
        <span><strong>微信</strong><small id="fileArchiveWechatStatus">等待检测</small></span>
      </label>
      <label class="file-archive-app-option">
        <input id="fileArchiveSourceWecom" type="radio" name="fileArchiveSourceApp" value="wecom">
        <span><strong>企业微信</strong><small id="fileArchiveWecomStatus">等待检测</small></span>
      </label>
    </div>
    <div id="fileArchiveLimitation" class="inline-feedback">正在检查本机应用和下载目录...</div>
  </section>

  <section class="section file-archive-conversations">
    <div class="section-title-row">
      <div>
        <h2>联系人和群聊</h2>
        <p class="section-description">只使用可靠的会话 ID；未能确认来源的文件仍进入待确认目录。</p>
      </div>
      <span id="fileArchiveConversationCount" class="badge">0/0</span>
    </div>
    <div class="file-archive-conversation-toolbar">
      <input id="fileArchiveConversationSearch" type="search" placeholder="搜索联系人或群聊">
      <button id="fileArchiveLoadConversations" type="button" class="secondary">加载会话</button>
      <button id="fileArchiveInspectCurrentConversation" type="button" class="secondary">读取当前会话</button>
    </div>
    <div class="file-archive-conversation-actions">
      <button id="fileArchiveSelectAllConversations" type="button" class="secondary">全选当前结果</button>
      <button id="fileArchiveClearConversations" type="button" class="secondary">清空选择</button>
      <button id="fileArchiveBindConversations" type="button">选择目录并绑定</button>
    </div>
    <div id="fileArchiveConversationList" class="file-archive-conversation-list"><div class="empty-list">点击“加载会话”读取本机清单</div></div>
    <div id="fileArchiveConversationMessage" class="inline-feedback">会话列表会先检查本机是否存在可靠的非正文元数据来源。</div>
    <div id="fileArchiveCurrentConversation" class="inline-feedback">当前会话：尚未读取</div>
  </section>

  <section class="section file-archive-output">
    <div class="section-title-row">
      <div>
        <h2>导出规则</h2>
        <p class="section-description">默认按应用、来源未知待确认和日期分层；原文件只读，目标文件会做 SHA-256 校验。</p>
      </div>
    </div>
    <div class="file-archive-field-row">
      <label class="field-block">
        <span>导出目录</span>
        <div class="file-archive-path-row">
          <input id="fileArchiveOutputPath" type="text" readonly placeholder="请选择本机目录">
          <button id="chooseFileArchiveOutput" type="button" class="secondary">选择目录</button>
        </div>
      </label>
      <label class="field-block">
        <span>目录结构</span>
        <select id="fileArchiveDirectoryMode">
          <option value="by_app_date">应用 / 来源未知待确认 / 日期</option>
          <option value="direct">直接放入导出目录</option>
        </select>
      </label>
    </div>
    <div class="file-archive-field-row">
      <label class="field-block">
        <span>重名策略</span>
        <select id="fileArchiveDuplicateMode">
          <option value="rename">自动改名（推荐）</option>
          <option value="skip">跳过重复文件</option>
          <option value="overwrite">覆盖同名文件</option>
        </select>
      </label>
      <label class="field-block">
        <span>稳定等待时间</span>
        <select id="fileArchiveStableSeconds">
          <option value="3">3 秒（推荐）</option>
          <option value="5">5 秒</option>
          <option value="10">10 秒</option>
        </select>
      </label>
    </div>
    <div class="file-archive-cloud-warning">导出目录如果位于 OneDrive 或 iCloud，可能产生同步冲突；建议使用本机项目归档目录。</div>
  </section>

  <section class="section file-archive-execution">
    <div class="section-title-row">
      <div>
        <h2>执行状态</h2>
        <p id="fileArchiveCurrentStatus" class="section-description">尚未启动监听</p>
      </div>
      <span id="fileArchiveRunBadge" class="badge">已停止</span>
    </div>
    <div class="file-archive-actions">
      <button id="startFileArchive" type="button">开始监听</button>
      <button id="pauseFileArchive" type="button" class="secondary">暂停</button>
      <button id="scanFileArchive" type="button" class="secondary">立即扫描</button>
      <button id="stopFileArchive" type="button" class="secondary">停止</button>
      <button id="refreshFileArchive" type="button" class="secondary">刷新状态</button>
    </div>
    <dl class="kv compact-kv file-archive-stats">
      <div><dt>监听目录</dt><dd id="fileArchiveWatchRoots">-</dd></div>
      <div><dt>等待下载完成</dt><dd id="fileArchiveWaiting">0</dd></div>
      <div><dt>已导出</dt><dd id="fileArchiveCompleted">0</dd></div>
      <div><dt>已跳过</dt><dd id="fileArchiveSkipped">0</dd></div>
      <div><dt>失败</dt><dd id="fileArchiveFailed">0</dd></div>
      <div><dt>来源未知</dt><dd id="fileArchiveUnknown">0</dd></div>
      <div><dt>最后成功</dt><dd id="fileArchiveLastSuccess">-</dd></div>
      <div><dt>最后错误</dt><dd id="fileArchiveLastError">-</dd></div>
    </dl>
    <div id="fileArchiveMessage" class="inline-feedback">请选择导出目录后开始监听。</div>
  </section>

  <section class="section file-archive-recent">
    <div class="section-title-row">
      <div>
        <h2>最近文件</h2>
        <p class="section-description">只显示文件名、处理状态和结果路径，不记录聊天正文。</p>
      </div>
      <span id="fileArchiveRecentCount" class="badge">0 条</span>
    </div>
    <div id="fileArchiveRecentList" class="file-archive-recent-list"><div class="empty-list">暂无处理记录</div></div>
  </section>
`;
