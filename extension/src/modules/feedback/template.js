export const feedbackTemplate = `
  <div class="page-heading">
    <div>
      <h2>反馈</h2>
      <p>提交使用建议、配置问题或故障信息</p>
    </div>
    <button id="backFromFeedback" type="button" class="secondary">返回首页</button>
  </div>
  <section class="section feedback-form">
    <div class="section-title-row">
      <div>
        <h2>反馈内容</h2>
        <p class="section-description">草稿仅保存在当前浏览器本机，不会自动上传。</p>
      </div>
      <span id="feedbackDraftStatus" class="badge">未保存</span>
    </div>
    <label class="field-block">
      <span>反馈类型</span>
      <select id="feedbackType">
        <option value="feature">功能建议</option>
        <option value="configuration">配置问题</option>
        <option value="bug">故障反馈</option>
        <option value="experience">使用体验</option>
        <option value="other">其他</option>
      </select>
    </label>
    <label class="field-block">
      <span>标题</span>
      <input id="feedbackTitle" type="text" maxlength="120" placeholder="简要描述问题或建议">
    </label>
    <label class="field-block">
      <span>详细说明</span>
      <textarea id="feedbackDescription" rows="6" maxlength="4000" placeholder="说明遇到的问题、期望效果或优化建议"></textarea>
    </label>
    <label class="field-block">
      <span>复现步骤或使用场景</span>
      <textarea id="feedbackSteps" rows="4" maxlength="2500" placeholder="可选：按顺序说明如何出现问题"></textarea>
    </label>
    <label class="check-row">
      <input id="feedbackIncludeDiagnostics" type="checkbox" checked>
      <span>附带安全环境信息，仅包含版本、系统、架构和连接状态</span>
    </label>
    <label class="check-row feedback-privacy">
      <input id="feedbackPrivacyConfirm" type="checkbox">
      <span>我已确认反馈中不包含客户名称、项目编号、文件路径、token、Cookie、密码或验证码</span>
    </label>
    <div id="feedbackMessage" class="inline-feedback">填写后可复制反馈内容</div>
    <div class="button-row">
      <button id="submitFeedback" type="button" disabled>提交反馈</button>
      <button id="copyFeedback" type="button">复制反馈</button>
      <button id="clearFeedback" type="button" class="secondary">清空</button>
    </div>
  </section>
  <section class="section feedback-security">
    <div class="section-title-row">
      <div>
        <h2>隐私边界</h2>
        <p class="section-description">环境信息不读取页面正文、公司、科目、附件、账号凭据或本机文件路径。</p>
      </div>
    </div>
    <dl class="kv compact-kv">
      <div><dt>反馈方式</dt><dd id="feedbackDeliveryMode">本机复制</dd></div>
      <div><dt>外部渠道</dt><dd id="feedbackChannelStatus">尚未配置</dd></div>
      <div><dt>草稿位置</dt><dd>Chrome 扩展本机存储</dd></div>
    </dl>
  </section>
`;
