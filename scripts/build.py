from pathlib import Path
import hashlib
import json

base = Path(__file__).resolve().parent.parent
origin = base / 'vendor' / 'upstream-1.0.3.js'
expected = json.loads((base / 'vendor' / 'UPSTREAM.json').read_text(encoding='utf-8'))
if hashlib.sha256(origin.read_bytes()).hexdigest() != expected['sha256']:
    raise RuntimeError('The vendored upstream file differs from its recorded fingerprint')
text = (base / 'vendor' / 'upstream-1.0.3.js').read_text(encoding='utf-8-sig')
module = (base / 'src' / 'review-memory.js').read_text(encoding='utf-8')
module += '\n' + (base / 'src' / 'learn-navigation.js').read_text(encoding='utf-8')

def change(old, new):
    global text
    if text.count(old) != 1:
        raise RuntimeError(f'Expected one integration point, got {text.count(old)}: {old[:90]}')
    text = text.replace(old, new)

change('// @name         智慧树掌握度-最小链路(自动续跑-狂点轰炸版)', '// @name         智慧树掌握度-解析记忆版')
change('// @version      1.0.3', '// @version      1.1.1-beta.1')
change('// @description  DOM 探测屏状态 + 页内控制面板；支持自定义 AI API（需使用有视觉能力的模型）；任意界面可续跑，仅手动开始后执行。默认关闭思考模式。', '// @description  基于 enro-ff 原版；读取练习解析并记住平台公布答案，同题按选项内容复用；解析识别失败时停止提示。')
change('    RESULT: "RESULT",', '    RESULT: "RESULT",\n    LEARN: "LEARN",\n    HISTORY: "HISTORY",\n    REVIEW: "REVIEW",')
change('    [SCREENS.RESULT]: "成绩页",', '    [SCREENS.RESULT]: "成绩页",\n    [SCREENS.LEARN]: "学习页目录",\n    [SCREENS.HISTORY]: "练习历史",\n    [SCREENS.REVIEW]: "解析记忆",')
change('  // src/panel.js', module + '\n  // src/panel.js')
change('  var detectScreen = () => {', '''  var detectScreen = () => {
    if (learnRoute()) return SCREENS.LEARN;
    if (reviewIsHistory()) return SCREENS.HISTORY;
    if (reviewIsPage()) return SCREENS.REVIEW;''')
change('      case SCREENS.LIST:\n        return "选中低分题";', '''      case SCREENS.HISTORY:
        return "处理历史记录";
      case SCREENS.REVIEW:
        return "读取整页解析";
      case SCREENS.LIST:
        return "选中低分题";''')
change('        case "quiz":', '''        case "memory":
          addLog(detail || "解析记忆");
          break;
        case "quiz":''')
change('    const optLines = opts.map((opt, i)', '''    if (unsafeWindow.__ZHS_STOP) throw new Error("已停止");
    const initialUrl=location.href;
    const initialSnapshot = reviewSnapshot(reviewQuizQuestion(), opts, mc);
    if(!initialSnapshot) {
      const choices=opts.map(reviewOptionKey);
      GM_setValue('zhs_question_change_v1',{time:new Date().toISOString(),reason:'unreadable-or-duplicate-options',choices});
      if(choices.length && new Set(choices).size!==choices.length)
        throw new Error('当前存在内容相同、无法区分的选项（可能是公式残缺），已停止；不是题目切换，请检查题面');
      throw new Error('当前题干或选项未完整识别，请导出页面结构检查');
    }
    const prepared=await reviewPrepareReference(initialSnapshot);
    if(unsafeWindow.__ZHS_STOP) throw new Error('已停止');
    const snapshot=reviewSnapshot(reviewQuizQuestion(),getQuizOptions(),isMultipleChoice());
    if(location.href!==initialUrl || !prepared || !snapshot || prepared.key!==snapshot.key || JSON.stringify(prepared.labels)!==JSON.stringify(snapshot.labels) || JSON.stringify(prepared.choices)!==JSON.stringify(snapshot.choices)) {
      GM_setValue('zhs_question_change_v1',{time:new Date().toISOString(),version:'1.1.1-beta.1',attempt:refreshAttempt,
        beforePath:new URL(initialUrl).pathname,afterPath:location.pathname,before:prepared,after:snapshot});
      if(refreshAttempt<2 && location.href===initialUrl && await reviewWaitStableQuiz(initialUrl)) {
        panelNotify('memory',`题目加载发生变化，已等候稳定，重新读取第 ${refreshAttempt+1}/2 次`);
        const freshImage=screenshotBase64?await captureElement(getScreenshotTarget(SCREENS.QUIZ)):null;
        return answerWithAI(freshImage?null:await readQuestion(),freshImage,refreshAttempt+1);
      }
      throw new Error('核对期间题目持续变化或页面已切换；已停止，请导出参考答案使用记录');
    }
    const remembered = reviewLookup(snapshot);
    if (remembered) {
      const verified=await reviewApplyLetters(remembered, opts, mc);
      reviewAudit(snapshot,'platform-review',remembered,verified);
      return remembered;
    }
    const miss=reviewMissReason(snapshot);
    if(miss.block) {
      reviewAudit(snapshot,'blocked','',{reason:miss.reason});
      throw new Error(miss.reason+'；请导出参考答案使用记录检查');
    }
    reviewAudit(snapshot,'miss','',{reason:miss.reason});
    const optLines = opts.map((opt, i)''')
change('const optLines = opts.map((opt, i) => `${String.fromCharCode(65 + i)}. ${opt.innerText.trim()}`);', 'const optLines = opts.map((opt, i) => `${snapshot.labels[i]}. ${reviewOptionKey(opt)}`);')
start = text.index('    const letters = parseAnswerLetters(raw);', text.index('  var answerWithAI = '))
end = text.index('    return raw;', start)
text = text[:start] + '''    if (unsafeWindow.__ZHS_STOP) throw new Error("已停止");
    const fresh = reviewSnapshot(reviewQuizQuestion(), getQuizOptions(), isMultipleChoice());
    if (!snapshot || !fresh || snapshot.key !== fresh.key || JSON.stringify(snapshot.choices) !== JSON.stringify(fresh.choices) || JSON.stringify(snapshot.labels)!==JSON.stringify(fresh.labels))
      throw new Error('等待 AI 时题目或选项发生变化，已停止');
    const letters = parseAnswerLetters(raw);
    const verified=await reviewApplyLetters(letters.join(''), opts, mc);
    reviewAudit(snapshot,'ai',letters.join(''),verified);
''' + text[end:]
change('    panelNotify("hop", { screen: SCREENS.QUIZ, action: "提交作业" });', '''    GM_setValue(REVIEW_PENDING, true);
    const stats=reviewGetStats();
    panelNotify('memory', `本轮已核对：参考答案 ${stats.hits} 题，AI ${stats.ai} 题，错配拦截 ${stats.blocked} 题`);
    GM_setValue('zhs_reference_stats_v1',{...stats,closed:true});
    panelNotify("hop", { screen: SCREENS.QUIZ, action: "提交练习，随后读取解析" });''')
change('            <span class="tag" id="tag-api" title="当前 API 配置">API：—</span>', '            <span class="tag" id="tag-api" title="当前 API 配置">API：—</span>\n            <span class="tag" id="tag-memory">参考答案 0 | AI 0</span>')
change('      const loop = isLoopOn();', '''      const loop = isLoopOn();
      const memoryStats=reviewGetStats();
      shadow.getElementById('tag-memory').textContent=`参考答案 ${memoryStats.hits} | AI ${memoryStats.ai} | 拦截 ${memoryStats.blocked}`;''')
change('          addLog(detail || "解析记忆");', '          addLog(detail || "解析记忆");\n          refreshStatus();')
change('addLog("AI 答题中…");', 'addLog("正在匹配题目、确定答案…");')
change('addLog(`AI 答题完成 | ${detail.aiOutput || ""}`);', 'addLog(`本题已核对勾选 | ${detail.aiOutput || ""}`);')
# Question content comes from the page and must be escaped in the log HTML.
change('${l.m}</span>', '${String(l.m).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</span>')
start = text.index('  async function runResultHop() {')
end = text.index('  async function runOneHop(', start)
text = text[:start] + '''  async function runResultHop() {
    if (!document.querySelector(".charts-rate")) return false;
    if(learnReturnUrl()) {
      const pct=learnReadPublishedMastery();if(pct!==null)learnRecordMastery(pct);
      if(learnKnownMastery()>=getThreshold()) {learnClearPending();return learnReturn();}
    }
    const direct=reviewButton(/^查看解析$/);
    if (direct && GM_getValue(REVIEW_PENDING, false)) {
      GM_setValue(REVIEW_RETURN, location.href);
      click(direct);
      return !!await reviewWait(() => reviewIsPage() || !document.querySelector('.charts-rate'));
    }
    const back=document.querySelector('.backup-icon') || document.querySelector(NAV_BACK_SEL);
    if (!back) { panelNotify('error', '成绩页未找到返回入口'); return false; }
    click(back);
    return !!await reviewWait(() => !document.querySelector('.charts-rate'));
  }
''' + text[end:]
change('    switch (screen) {\n      case SCREENS.LIST:\n        return runListHop();', '''    switch (screen) {
      case SCREENS.LEARN:
        return learnRun();
      case SCREENS.HISTORY:
        return reviewRunHistory();
      case SCREENS.REVIEW:
        return reviewRunPage();
      case SCREENS.LIST:
        return runListHop();''')
change('''        if (!progressed) {
          panelNotify''', '''        if (!progressed) {
          setLoopKey(false);
          panelNotify''')
change('          if (!found) {\n            panelNotify', '          if (!found) {\n            setLoopKey(false);\n            panelNotify')
change('          if (screen === SCREENS.UNKNOWN) {\n            panelNotify', '          if (screen === SCREENS.UNKNOWN) {\n            setLoopKey(false);\n            panelNotify')
# Do not execute any clicks after stopping during screenshot capture or an AI request.
change('    setLoopKey(true);\n    if (getMismatchNode()) {', '    if (unsafeWindow.__ZHS_STOP) return false;\n    setLoopKey(true);\n    if (getMismatchNode()) {')
# Preserve the original operation modes; review learning is attached to mastery practice.
change('  // src/index.js', '''  // Local review-memory controls.
  GM_registerMenuCommand("参考答案：导出使用记录", () => {
    const report=reviewAuditReport();
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='zhihuishu-reference-usage.json';
    document.body.appendChild(link);link.click();link.remove();setTimeout(() => URL.revokeObjectURL(url),10000);
  });
  GM_registerMenuCommand("解析排查：导出页面结构", () => {
    const report=reviewLayoutDiagnostic();
    const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json;charset=utf-8'}));
    const link=document.createElement('a');link.href=url;link.download='zhihuishu-review-layout.json';
    document.body.appendChild(link);link.click();link.remove();setTimeout(() => URL.revokeObjectURL(url),10000);
  });
  GM_registerMenuCommand("选项排查：导出选中状态", () => {
    const report=GM_getValue('zhs_last_selection_debug_v1', null) || reviewSelectionDiagnostic(getQuizOptions(), '');
    const blob=new Blob([JSON.stringify(report,null,2)], {type:'application/json;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');link.href=url;link.download='zhihuishu-selection-debug.json';
    document.body.appendChild(link);link.click();link.remove();setTimeout(() => URL.revokeObjectURL(url),10000);
  });
  GM_registerMenuCommand("解析记忆：显示题库数量", () => alert(`已记住 ${Object.keys(reviewReadStore()).length} 道题。只保存平台公布答案；AI 猜测不会写入。`));
  GM_registerMenuCommand("解析记忆：重新读取本次解析", () => {
    GM_setValue(REVIEW_HISTORY_DONE, '');
    GM_setValue(REVIEW_PENDING, true);
    startChain();
  });
  GM_registerMenuCommand("解析记忆：清空题库", () => {
    if (confirm('清空本脚本保存的解析答案？API 设置将保留。')) {
      GM_setValue(REVIEW_STORE, {});
      GM_setValue(REVIEW_HISTORY_DONE, '');
      panelNotify('memory', '解析题库已清空');
    }
  });
  // src/index.js''')
change('      const el = all[i];\n      const pct', '      const el = all[i];\n      if (!reviewVisible(el) || reviewSkipFor(el)) continue;\n      const pct')
change('  var answerWithAI = async (blocks, screenshotBase64 = null) => {', '  var answerWithAI = async (blocks, screenshotBase64 = null, refreshAttempt = 0) => {')
change('        if (increase) incRetryCount(i);', '        if (increase) { incRetryCount(i); reviewRememberList(el); }')
change('      const el2 = document.querySelector(".el-progress--dashboard");', '      const el2 = [...document.querySelectorAll(".el-progress--dashboard")].find(reviewVisible);')
change('    const el = await waitFor(() => findLowPctProgress(true));\n    return clickUntilGone(() => findLowPctProgress());', '''    const el = await waitFor(() => findLowPctProgress(true));
    if(!el || unsafeWindow.__ZHS_STOP) return false;
    const oldUrl=location.href;
    click(el);
    return !!await reviewWait(() => location.href!==oldUrl || (detectScreen()!==SCREENS.LIST && detectScreen()!==SCREENS.UNKNOWN));''')
change('    if (!isReady) return false;\n    const oldText', '    if (!isReady) return false;\n    if (reviewHasFill()) return reviewSkipFill();\n    const oldText')
change('      if (!q || !q.innerText.trim()) return null;', '      if (reviewHasFill()) return q || document.body;\n      if (!q || !q.innerText.trim()) return null;')
change('    if (reviewIsPage()) return SCREENS.REVIEW;', '    if (reviewIsPage()) return SCREENS.REVIEW;\n    if (/\\/studentReviewTestOrExam\\//.test(location.pathname) && reviewHasFill()) return SCREENS.QUIZ;')
change('  var reviewRunPage = async () => {', '  var reviewRunPage = async () => {\n    if(reviewHasFill()) return reviewSkipFill();')
change("      const units=reviewUnits();\n      if (!units.length)", "      if(reviewHasFill()) return true;\n      const units=reviewUnits();\n      if (!units.length)")
change('    const result=await reviewScanPage();', '    if(reviewHasFill()) return reviewSkipFill();\n    const result=await reviewScanPage();\n    if(reviewHasFill()) return reviewSkipFill();')
change('  // Local review-memory controls.', '''  // Local review-memory controls.
  GM_registerMenuCommand("顺序进度：查看", () => {
    const learning=GM_getValue(LEARN_STATE,null);
    if(learning) {alert(`当前知识点：${learning.title}\\n已向后处理 ${learning.completed?.length||0} 节；按左侧目录继续。`);return;}
    const state=GM_getValue(REVIEW_SEQUENCE,null);
    alert(state?`起点：${state.anchor?.title||state.anchor?.rowText||'列表首项'}\\n进度：${state.position}/${state.queue?.length||'待定位'}\\n只向后处理，不回到前面的低分项。`:'尚未设置顺序起点');
  });
  GM_registerMenuCommand("顺序进度：清除并重新设起点", () => {
    stopChain();GM_setValue(REVIEW_SEQUENCE,null);GM_setValue(REVIEW_LIST_CONTEXT,{});GM_setValue(LEARN_STATE,null);
    panelNotify('memory','顺序进度已清除。请打开要开始的知识点练习，再点开始/继续');
  });
  GM_registerMenuCommand("填空跳过：查看标记", () => {
    const items=Object.values(GM_getValue(REVIEW_SKIP_STORE,{}));
    alert(items.length?items.map(x=>`${x.title||x.rowText}：${x.reason}`).join('\\n'):'暂无填空题跳过标记');
  });
  GM_registerMenuCommand("填空跳过：清除标记", () => {
    GM_setValue(REVIEW_SKIP_STORE,{});
    document.querySelectorAll('[data-zhs-skip-label]').forEach(x=>x.remove());
    panelNotify('memory','填空题跳过标记已清除，下次循环将重新检查');
  });''')
change('    unsafeWindow.__ZHS_STOP = false;\n    setLoopKey(true);', '    unsafeWindow.__ZHS_STOP = false;\n    if(reviewListUrl(location.href)) GM_setValue(LEARN_STATE,null);\n    reviewSequenceSeed();\n    setLoopKey(true);')
change('  async function runListHop() {\n    if (!isLoopOn()) return false;', '''  async function runListHop() {
    if (!isLoopOn()) return false;
    const learning=GM_getValue(LEARN_STATE,null);
    if(learnRoute(learning?.url)?.listUrl===reviewListUrl(location.href)) {
      reviewNavigate(learning.url);return !!await reviewWait(()=>!!learnRoute());
    }''')
change('  async function runFromHere() {\n    if (unsafeWindow.__ZHS_CHAIN_RUNNING) return;', '  async function runFromHere() {\n    if (unsafeWindow.__ZHS_CHAIN_RUNNING) return;\n    if(!GM_getValue(REVIEW_SEQUENCE,null)) reviewSequenceSeed();')
change('action: "无待刷题目，关闭循环"', 'action: "本次起点之后已无待处理知识点，结束顺序流程"')
change('  // src/index.js\n  GM_registerMenuCommand', '  // src/index.js\n  document.addEventListener("click",reviewCaptureListClick,true);\n  GM_registerMenuCommand')
text = text.replace('GM_getValue(THRESHOLD_KEY, 80)', 'GM_getValue(THRESHOLD_KEY, 90)')
# Public package metadata; keep the namespace for in-place upgrades.
change('// @run-at       document-idle', '// @author       enro-ff; jkll72\n// @license      ISC\n// @homepageURL  https://github.com/jkll72/zhihuishu-review-memory\n// @supportURL   https://github.com/jkll72/zhihuishu-review-memory/issues\n// @updateURL    https://raw.githubusercontent.com/jkll72/zhihuishu-review-memory/main/zhihuishu-review-memory.user.js\n// @downloadURL  https://raw.githubusercontent.com/jkll72/zhihuishu-review-memory/main/zhihuishu-review-memory.user.js\n// @run-at       document-idle')
text = text.replace('https://cdn.jsdelivr.net/npm/html2canvas-pro/dist/', 'https://cdn.jsdelivr.net/npm/html2canvas-pro@2.5.3/dist/')
# Do not expose a key prefix in panel tooltips or print full prompts/responses by default.
text = text.replace('`${cfg.apiKey.slice(0, 8)}...`', '"已配置"')
for line in [
    '    console.log("[ZHS-AI] 请求 messages:", messages);',
    '    console.log("[ZHS-AI] 请求体:", reqBody);',
    '        console.log("[ZHS-AI] 原始响应:", res.responseText);',
    '            console.warn("[ZHS-AI] reasoning_content:", reasoning);',
    '          console.log("[ZHS-AI] 正文内容(content):", text);',
    '        console.log("[ZHS-IMG] 放大后图片:", canvas.toDataURL("image/png"));',
]:
    text = text.replace(line, '')
text = text.replace('console.error("[ZHS-AI] 响应解析失败:", e, res.responseText);', 'console.error("[ZHS-AI] 响应解析失败:", e.message);')

out = base / 'zhihuishu-review-memory.user.js'
text = text.replace('document.querySelector(".questionContent")','reviewQuizQuestion()')
out.write_text(text, encoding='utf-8')
print(f'Built {out.name}: {len(text)} characters')
