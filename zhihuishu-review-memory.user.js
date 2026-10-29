// ==UserScript==
// @name         智慧树掌握度-解析记忆版
// @namespace    https://github.com/local/zhihuishu-min-chain
// @version      1.1.1-beta.1
// @description  基于 enro-ff 原版；读取练习解析并记住平台公布答案，同题按选项内容复用；解析识别失败时停止提示。
// @match        https://ai-smart-course-student-pro.zhihuishu.com/*
// @match        https://studentexamcomh5.zhihuishu.com/*
// @match        https://examloop.zhihuishu.com/*
// @require      https://cdn.jsdelivr.net/npm/html2canvas-pro@2.5.3/dist/html2canvas-pro.min.js
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *
// @author       enro-ff; jkll72
// @license      ISC
// @homepageURL  https://github.com/jkll72/zhihuishu-review-memory
// @supportURL   https://github.com/jkll72/zhihuishu-review-memory/issues
// @updateURL    https://raw.githubusercontent.com/jkll72/zhihuishu-review-memory/main/zhihuishu-review-memory.user.js
// @downloadURL  https://raw.githubusercontent.com/jkll72/zhihuishu-review-memory/main/zhihuishu-review-memory.user.js
// @run-at       document-idle
// ==/UserScript==

(() => {
  // src/constants.js
  var LOOP_KEY = "zhs_loop";
  var PANEL_POS_KEY = "zhs_panel_pos";
  var PANEL_COLLAPSED_KEY = "zhs_panel_collapsed";
  var THRESHOLD_KEY = "zhs_threshold";
  var RETRY_KEY_PREFIX = "zhs_retry_";
  var RETRY_MAX_KEY = "zhs_retry_max";
  var MAX_RETRIES = 4;
  var MAX_HOPS = 500;
  var ROUTE_SETTLE_MS = 200;
  var NAV_BACK_SEL = '[class*="w-[32px]"][class*="h-[32px]"].cursor-pointer';
  var SCREENS = {
    LIST: "LIST",
    DETAIL: "DETAIL",
    PRE_QUIZ: "PRE_QUIZ",
    QUIZ: "QUIZ",
    RESULT: "RESULT",
    LEARN: "LEARN",
    HISTORY: "HISTORY",
    REVIEW: "REVIEW",
    UNKNOWN: "UNKNOWN"
  };
  var AI_CHAT = {
    maxAttempts: 3,
    timeoutMs: 12e4,
    retryDelayMs: 1500
  };
  var AI_STATUS = {
    IDLE: "idle",
    REQUESTING: "requesting",
    RETRYING: "retrying",
    SUCCESS: "success",
    FAILED: "failed"
  };
  var CHAIN_STEPS = [
    { id: SCREENS.LIST, label: "列表" },
    { id: SCREENS.DETAIL, label: "详情" },
    { id: SCREENS.PRE_QUIZ, label: "提升入口" },
    { id: SCREENS.QUIZ, label: "答题" },
    { id: SCREENS.RESULT, label: "成绩" }
  ];
  var SCREEN_LABELS = {
    [SCREENS.LIST]: "掌握度列表",
    [SCREENS.DETAIL]: "知识点详情",
    [SCREENS.PRE_QUIZ]: "提升入口",
    [SCREENS.QUIZ]: "答题页",
    [SCREENS.RESULT]: "成绩页",
    [SCREENS.LEARN]: "学习页目录",
    [SCREENS.HISTORY]: "练习历史",
    [SCREENS.REVIEW]: "解析记忆",
    [SCREENS.UNKNOWN]: "未识别页面"
  };

  // src/utils.js
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  var getPageUrlKey = () => {
    try {
      return new URL(window.location.href).pathname.replace(/\//g, "_").replace(/^_+|_+$/g, "") || "root";
    } catch {
      return "unknown";
    }
  };
  var makeRetryKey = (index) => `${RETRY_KEY_PREFIX}${getPageUrlKey()}_${index}`;
  var makeRetryMaxKey = () => `${RETRY_MAX_KEY}_${getPageUrlKey()}`;
  var isLoopOn = () => {
    const date = Date.now();
    return GM_getValue(LOOP_KEY, 0) >= date;
  };
  var setLoopKey = (value = false) => {
    if (value && !unsafeWindow.__ZHS_STOP) {
      GM_setValue(LOOP_KEY, Date.now() + 1e3 * 60 * 2);
    } else {
      GM_setValue(LOOP_KEY, 0);
    }
  };
  var getThreshold = () => GM_getValue(THRESHOLD_KEY, 90);
  var getRetryCount = (index) => GM_getValue(makeRetryKey(index), 0);
  var setRetryCount = (index, count) => GM_setValue(makeRetryKey(index), count);
  var incRetryCount = (index) => setRetryCount(index, getRetryCount(index) + 1);
  var resetRetryCounts = () => {
    const max = GM_getValue(makeRetryMaxKey(), 0);
    for (let i = 0; i < max; i++) {
      setRetryCount(i, 0);
    }
  };
  var updateRetryMax = (newV) => {
    const current = GM_getValue(makeRetryMaxKey(), 0);
    const num = parseInt(newV, 10);
    if (!Number.isNaN(num) && num >= current) GM_setValue(makeRetryMaxKey(), num + 1);
  };
  var lowThanMaxRetry = (i) => {
    return getRetryCount(i) <= MAX_RETRIES;
  };
  var getApiCfg = () => ({
    baseUrl: GM_getValue("zhs_api_baseurl", ""),
    apiKey: GM_getValue("zhs_api_apikey", ""),
    model: GM_getValue("zhs_api_model", ""),
    maxTokens: GM_getValue("zhs_api_maxtokens", 2048),
    timeoutMs: GM_getValue("zhs_api_timeout", 12e4)
  });
  var saveMaxTokens = (val) => {
    const num = parseInt(val, 10);
    if (!Number.isNaN(num) && num >= 256 && num <= 8192) {
      GM_setValue("zhs_api_maxtokens", num);
      return true;
    }
    return false;
  };
  var saveTimeout = (val) => {
    const num = parseInt(val, 10);
    if (!Number.isNaN(num) && num >= 1e4 && num <= 3e5) {
      GM_setValue("zhs_api_timeout", num);
      return true;
    }
    return false;
  };

  // src/dom.js
  var click = (el) => {
    if (!el) return;
    el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: unsafeWindow }));
  };
  var clickUntilGone = async (selectorOrFn, timeout = 15e3, step = 200) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (unsafeWindow.__ZHS_STOP) return false;
      const el = typeof selectorOrFn === "function" ? selectorOrFn() : document.querySelector(selectorOrFn);
      if (!el) return true;
      click(el);
      await sleep(step);
    }
    return false;
  };
  var waitFor = async (fn, timeout = 3e4, step = 100) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (unsafeWindow.__ZHS_STOP) return null;
      const v = fn();
      if (v) return v;
      await sleep(step);
    }
    return null;
  };
  var detectScreen = () => {
    if (learnRoute()) return SCREENS.LEARN;
    if (reviewIsHistory()) return SCREENS.HISTORY;
    if (reviewIsPage()) return SCREENS.REVIEW;
    if (/\/studentReviewTestOrExam\//.test(location.pathname) && reviewHasFill()) return SCREENS.QUIZ;
    if (document.querySelector(".charts-rate")) return SCREENS.RESULT;
    const q = reviewQuizQuestion();
    if (q?.innerText?.trim()) return SCREENS.QUIZ;
    if (document.querySelector(".improve-btn")) return SCREENS.PRE_QUIZ;
    if (document.querySelector(".simplified-mastery__action")) return SCREENS.DETAIL;
    const dash = document.querySelector(".el-progress--dashboard");
    if (dash && /\d+/.test(dash.innerText || "")) return SCREENS.LIST;
    return SCREENS.UNKNOWN;
  };
  var parsePct = (el) => parseInt((el?.innerText || "").replace(/\D/g, ""), 10);
  var findLowPctProgress = (increase = false) => {
    const threshold = getThreshold();
    const all = [...document.querySelectorAll(".el-progress--dashboard")];
    updateRetryMax(all.length);
    for (let i = 0; i < all.length; i++) {
      const el = all[i];
      if (!reviewVisible(el) || reviewSkipFor(el)) continue;
      const pct = parsePct(el);
      if (!Number.isNaN(pct) && pct < threshold && lowThanMaxRetry(i)) {
        if (increase) { incRetryCount(i); reviewRememberList(el); }
        return el;
      }
    }
    return null;
  };
  var hasListWork = () => !!findLowPctProgress();
  var enlargeSmallImage = (imgEl, minTarget = 20) => new Promise((resolve) => {
    const w = imgEl.naturalWidth || imgEl.width || 0;
    const h = imgEl.naturalHeight || imgEl.height || 0;
    if (w > 10 && h > 10) {
      resolve(imgEl.src);
      return;
    }
    GM_xmlhttpRequest({
      method: "GET",
      url: imgEl.src,
      responseType: "blob",
      onload: (resp) => {
        const blob = resp.response;
        const blobUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(blobUrl);
          const scale = minTarget / Math.min(img.width, img.height);
          const nw = Math.round(img.width * scale);
          const nh = Math.round(img.height * scale);
          const canvas = document.createElement("canvas");
          canvas.width = nw;
          canvas.height = nh;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, nw, nh);
  
          resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = () => {
          URL.revokeObjectURL(blobUrl);
          resolve(imgEl.src);
        };
        img.src = blobUrl;
      },
      onerror: () => resolve(imgEl.src)
    });
  });
  var getQuestionBlocks = async (root) => {
    if (!root) return [];
    const blocks = [];
    let imgIndex = 0;
    const pushText = (s) => {
      const t = (s || "").replace(/\s+/g, " ").trim();
      if (!t) return;
      const last = blocks[blocks.length - 1];
      if (last && last.type === "text") last.content += " " + t;
      else blocks.push({ type: "text", content: t });
    };
    const walk = async (node) => {
      if (node.nodeType === 3) {
        pushText(node.textContent);
        return;
      }
      if (node.nodeType !== 1) return;
      if (/^(SCRIPT|STYLE)$/i.test(node.tagName)) return;
      if (node.classList?.contains("upload")) return;
      if (node.tagName === "IMG") {
        if (node.src.includes("fc9f26dc-8a16-44b9-b171-17a42641b0da")) {
          pushText("x");
          return;
        }
        const w = node.naturalWidth || node.width || 0;
        const h = node.naturalHeight || node.height || 0;
        if (w > 0 && h > 0) {
          imgIndex += 1;
          const src = await enlargeSmallImage(node);
          blocks.push({
            type: "image",
            index: imgIndex,
            src,
            alt: node.alt || ""
          });
        }
        return;
      }
      if (node.tagName === "BR") {
        pushText("\n");
        return;
      }
      for (const child of node.childNodes) await walk(child);
    };
    await walk(root);
    return blocks;
  };
  var blocksToMarkdown = (blocks) => blocks.map((b) => b.type === "text" ? b.content : `[IMAGE:${b.index}]`).join("\n");
  var readQuestion = async () => {
    const root = reviewQuizQuestion();
    const blocks = await getQuestionBlocks(root);
    unsafeWindow.__questionBlocks = blocks;
    return blocks;
  };
  var isMultipleChoice = () => !!document.querySelector(".el-checkbox-group.checkbox-view");
  var getQuizOptions = () => {
    if (isMultipleChoice()) {
      return [...document.querySelectorAll(".el-checkbox-group.checkbox-view .el-checkbox")];
    }
    return [...document.querySelectorAll("ul.radio-view li")];
  };
  var getMismatchNode = () => {
    const list = [...document.querySelectorAll(".custom-tree-answer-normal.no-answer")];
    const sortChar = (document.querySelector(".letterSortNum")?.innerText || "").trim().charAt(0);
    if (list.length >= 2) {
      for (let i = 1; i < list.length; i++) {
        const c1 = (list[i].innerText || "").trim().charAt(0);
        if (c1 !== sortChar) return list[i];
      }
    }
    return null;
  };
  var getBase64Image = (url) => {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url,
        responseType: "blob",
        onload: (response) => {
          if (response.status === 200) {
            const blob = response.response;
            const reader = new FileReader();
            reader.onloadend = () => {
              resolve(reader.result);
            };
            reader.readAsDataURL(blob);
          } else {
            reject(new Error("图片加载失败"));
          }
        },
        onerror: (err) => {
          reject(err);
        }
      });
    });
  };
  var processCrossImg = async (originalEl) => {
    const rect = originalEl.getBoundingClientRect();
    const clone = originalEl.cloneNode(true);
    clone.style.position = "fixed";
    clone.style.left = "-99999px";
    clone.style.top = "0";
    clone.style.width = rect.width + "px";
    clone.style.height = rect.height + "px";
    clone.style.boxSizing = "border-box";
    const computedStyle = window.getComputedStyle(originalEl);
    clone.style.backgroundColor = computedStyle.backgroundColor || "#ffffff";
    clone.style.color = computedStyle.color || "#333333";
    document.body.appendChild(clone);
    const images = clone.querySelectorAll("img");
    const decodePromises = [];
    const promises = Array.from(images).map(async (img) => {
      const src = img.src;
      if (!src || src.startsWith("data:") || src.startsWith(window.location.origin)) {
        return;
      }
      try {
        const base64 = await getBase64Image(src);
        img.src = base64;
        if (typeof img.decode === "function") {
          decodePromises.push(img.decode().catch(() => {
          }));
        }
      } catch (e) {
        console.error("[ZHS-IMG] 图片转换失败: ", src, e);
      }
    });
    await Promise.all(promises);
    await Promise.all(decodePromises);
    await new Promise((resolve) => setTimeout(resolve, 100));
    return clone;
  };
  var captureElement = async (element) => {
    if (!element) return null;
    const cleanedElement = await processCrossImg(element);
    const h2c = window.html2canvas || globalThis.html2canvas;
    if (!h2c) {
      cleanedElement.remove();
      throw new Error("未加载 html2canvas 库！请检查脚本 @require 配置。");
    }
    try {
      const canvas = await h2c(cleanedElement, {
        scale: 2,
        useCORS: true,
        backgroundColor: window.getComputedStyle(element).backgroundColor || "#ffffff"
      });
      const imgData = canvas.toDataURL("image/png");
      cleanedElement.remove();
      return imgData;
    } catch (e) {
      cleanedElement.remove();
      throw e;
    }
  };
  var getScreenshotTarget = (screen) => {
    if (screen === SCREENS.QUIZ) {
      const q = reviewQuizQuestion();
      if (!q) return null;
      const mc = !!document.querySelector(".el-checkbox-group.checkbox-view");
      const opts = mc ? document.querySelector(".el-checkbox-group.checkbox-view") : document.querySelector("ul.radio-view");
      if (!opts) return q;
      let parent = q.parentElement;
      while (parent && parent !== document.body && parent !== document.documentElement) {
        if (parent.contains(opts)) {
          return parent;
        }
        parent = parent.parentElement;
      }
      return q;
    } else {
      return document.querySelector(".question-area-content");
    }
  };

  // Local review memory. Only answers explicitly published in review DOM are trusted.
  var REVIEW_STORE = 'zhs_review_memory_v1';
  var REVIEW_PENDING = 'zhs_review_pending_v1';
  var REVIEW_RETURN = 'zhs_review_return_v1';
  var REVIEW_HISTORY_DONE = 'zhs_review_history_done_v1';
  var REVIEW_HISTORY_OPEN = 'zhs_review_history_open_v1';
  var REVIEW_IMAGE_CACHE='zhs_formula_content_hashes_v1';
  var reviewImageHashes=GM_getValue(REVIEW_IMAGE_CACHE,{});
  var reviewLog = (message) => panelNotify('hop', {screen: SCREENS.REVIEW, action: message});
  var REVIEW_SKIP_STORE='zhs_fill_skip_v1', REVIEW_LIST_CONTEXT='zhs_list_context_v1';
  var REVIEW_SEQUENCE='zhs_forward_sequence_v1';
  var reviewDecodeTitle = value => {
    let text=typeof value==='string'?value:'';
    for(let i=0;i<6;i++) {
      const before=text;
      try{if(/^"[\s\S]*"$/.test(text)){const parsed=JSON.parse(text);if(typeof parsed==='string')text=parsed;}}catch(_){}
      try{if(/%[0-9a-f]{2}/i.test(text))text=decodeURIComponent(text);}catch(_){}
      if(text===before && /^[A-Za-z0-9+/_=-]{12,}$/.test(text)) {
        try {
          const binary=atob(text.replace(/-/g,'+').replace(/_/g,'/'));
          let decoded=binary;try{decoded=decodeURIComponent([...binary].map(c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join(''));}catch(_){}
          if(/%[0-9a-f]{2}|[\u3400-\u9fff]|^"/i.test(decoded))text=decoded;
        }catch(_){}
      }
      if(text===before)break;
    }
    return text;
  };
  var reviewSequenceSeed = () => {
    if(GM_getValue('zhs_run_mode','chain')==='homework') return;
    if(learnRoute()) {learnSeed();return;}
    const info=reviewPracticeInfo(), saved=GM_getValue(REVIEW_LIST_CONTEXT,{});
    const listUrl=info.listUrl||reviewListUrl(location.href);
    if(!listUrl) return;
    const existing=GM_getValue(REVIEW_SEQUENCE,null);
    // An explicit start inside an exercise makes that exercise the new starting point.
    if(info.title) {
      if(existing?.listUrl===listUrl && existing.anchor?.title===info.title && (!existing.queue||existing.position<existing.queue.length)) return;
      GM_setValue(REVIEW_SEQUENCE,{listUrl,anchor:{title:info.title},queue:null,position:0,attempts:{}});
      panelNotify('memory',`顺序起点：${info.title}；只向后处理，不返回前面的低分知识点`);
    } else if(!existing || existing.listUrl!==listUrl) {
      GM_setValue(REVIEW_SEQUENCE,{listUrl,anchor:saved.listUrl===listUrl?{rowText:saved.rowText}:null,queue:null,position:0,attempts:{}});
    }
  };
  var reviewSequenceRows = () => [...document.querySelectorAll('.el-progress--dashboard')].filter(reviewVisible)
    .map(el=>({el,...reviewListIdentity(el)}));
  var reviewRowMatches = (row,anchor) => !!anchor && ((anchor.rowText&&row.text===anchor.rowText) ||
    (anchor.title&&[row.row,...row.row.querySelectorAll('*')].some(node=>!node.closest('[data-zhs-skip-label]')&&reviewCanonical(reviewText(node))===anchor.title)));
  var reviewFindNextProgress = (increase=false) => {
    const listUrl=reviewListUrl(location.href),rows=reviewSequenceRows();
    if(!listUrl || !rows.length) return null;
    let state=GM_getValue(REVIEW_SEQUENCE,null);
    if(!state || state.listUrl!==listUrl) {
      const saved=GM_getValue(REVIEW_LIST_CONTEXT,{});
      state={listUrl,anchor:saved.listUrl===listUrl?{rowText:saved.rowText}:null,queue:null,position:0,attempts:{}};
    }
    if(state.anchor?.title)state.anchor.title=reviewCanonical(reviewDecodeTitle(state.anchor.title));
    if(!state.queue) {
      const matches=state.anchor?rows.map((row,i)=>reviewRowMatches(row,state.anchor)?i:-1).filter(i=>i>=0):[0];
      if(matches.length!==1) {panelNotify('memory','顺序起点尚未在当前列表中唯一找到，请展开对应章节后继续；不会从列表头重新选题');return null;}
      state.queue=rows.slice(matches[0]).map(row=>({rowText:row.text}));state.position=0;
      if(state.queue.some(item=>!item.rowText) || new Set(state.queue.map(x=>x.rowText)).size!==state.queue.length) {
        panelNotify('error','列表存在无法区分的知识点，无法安全建立顺序');return null;
      }
    }
    const persist=()=>GM_setValue(REVIEW_SEQUENCE,state);
    while(state.position<state.queue.length) {
      const target=state.queue[state.position],matches=rows.filter(row=>reviewRowMatches(row,target));
      if(matches.length!==1) {persist();panelNotify('memory','下一个知识点尚未在当前列表显示，请展开原章节；保留顺序位置');return null;}
      const {el}=matches[0],pct=parsePct(el),attempts=state.attempts[target.rowText]||0;
      if(reviewSkipFor(el) || (!Number.isNaN(pct)&&pct>=getThreshold()) || attempts>=MAX_RETRIES) {
        if(attempts>=MAX_RETRIES) panelNotify('memory',`该知识点已尝试 ${MAX_RETRIES} 次，继续后一个`);
        state.position++;persist();continue;
      }
      if(Number.isNaN(pct)) {persist();return null;}
      if(increase) {
        state.attempts[target.rowText]=attempts+1;
        reviewRememberList(el);
        panelNotify('memory',`顺序进度 ${state.position+1}/${state.queue.length}，掌握度 ${pct}%，第 ${attempts+1} 次练习`);
      }
      persist();return el;
    }
    persist();return null; // End means end; never wrap around to earlier low scores.
  };
  var reviewCaptureListClick = event => {
    const listUrl=reviewListUrl(location.href);
    if(!listUrl || unsafeWindow.__ZHS_CHAIN_RUNNING || isLoopOn()) return;
    const matches=reviewSequenceRows().filter(row=>row.row.contains(event.target));
    if(matches.length!==1) return;
    reviewRememberList(matches[0].el);
    GM_setValue(REVIEW_SEQUENCE,{listUrl,anchor:{rowText:matches[0].text},queue:null,position:0,attempts:{}});
  };
  findLowPctProgress=reviewFindNextProgress;
  var reviewHasFill = () => {
    const area=reviewQuizQuestion() || document.body;
    // Match type labels, not an incidental mention of “填空题” in a choice's text.
    const labels=[...document.querySelectorAll('span,div,h2,h3,h4,h5,p,b,strong,label')].filter(el=>
      !el.closest('#zhs-panel-host,ul.radio-view,.el-radio-group,.el-checkbox-group') && reviewVisible(el));
    if(labels.some(el=>/^(?:\d+[.、．])?填空(?:客观|主观)?题(?:[（(](?:自动批阅|人工批阅|手动批阅|\d+(?:\.\d+)?分)[）)])*$/.test(reviewText(el).replace(/\s+/g,'')))) return true;
    return !![...area.querySelectorAll('.fill-blank input,.fillBlank input,.blank-answer input,textarea,[contenteditable="true"]')]
      .find(el=>reviewVisible(el)&&!el.disabled&&!el.closest('[class*="upload"],#zhs-panel-host') &&
        !area.querySelector('ul.radio-view,.el-radio-group,.el-checkbox-group'));
  };
  var reviewListUrl = value => {
    try {const url=new URL(value);return url.origin==='https://ai-smart-course-student-pro.zhihuishu.com' && /^\/singleCourse\/knowledgeStudy\/[^/]+\/[^/]+\/?$/.test(url.pathname)?url.origin+url.pathname.replace(/\/$/,''):'';}catch(_){return '';}
  };
  var reviewPracticeInfo = () => {
    const url=new URL(location.href), parts=url.pathname.split('/').filter(Boolean);
    let course='', cls=url.searchParams.get('classId')||'', title=url.searchParams.get('nodeName')||'', point=url.searchParams.get('pointId')||'';
    if(parts[0]==='studentReviewTestOrExam') {
      course=parts[4]||'';
      try{title=JSON.parse(decodeURIComponent(atob(parts[5])));}catch(_){}
    } else if(parts[0]==='examPreview') {course=parts[1]||'';cls=parts[5]||'';point=parts[4]||'';}
    else if(parts[0]==='masteryHistory') {course=parts[1]||'';cls=parts[2]||'';point=parts[3]||'';}
    else if(parts[0]==='learnPage') {course=parts[1]||'';point=parts[2]||'';cls=parts[3]||'';title=learnTitle();}
    const listUrl=course&&cls?reviewListUrl(`https://ai-smart-course-student-pro.zhihuishu.com/singleCourse/knowledgeStudy/${course}/${cls}`):'';
    return {listUrl,title:reviewCanonical(reviewDecodeTitle(title)),point};
  };
  var reviewListIdentity = el => {
    let row=el.parentElement;
    while(row?.parentElement && row.parentElement!==document.body && row.parentElement.querySelectorAll('.el-progress--dashboard').length===1) row=row.parentElement;
    const clone=(row||el).cloneNode(true);
    clone.querySelectorAll('.el-progress--dashboard,[data-zhs-skip-label]').forEach(x=>x.remove());
    return {row,text:reviewCanonical(reviewText(clone))};
  };
  var reviewSkipFor = el => {
    const listUrl=reviewListUrl(location.href), {row,text}=reviewListIdentity(el);
    const found=Object.values(GM_getValue(REVIEW_SKIP_STORE,{})).find(x=>x.listUrl===listUrl &&
      ((x.rowText&&x.rowText===text) || (x.title&&[...row.querySelectorAll('*')].some(n=>!n.closest('[data-zhs-skip-label]')&&reviewCanonical(reviewText(n))===x.title))));
    if(found&&!row.querySelector('[data-zhs-skip-label]')) {
      const badge=document.createElement('span');badge.dataset.zhsSkipLabel='true';badge.textContent='含填空题 · 已跳过';
      badge.style.cssText='display:block;color:#b45309;font-size:12px;';row.appendChild(badge);
    }
    return !!found;
  };
  var reviewRememberList = el => {
    const {text}=reviewListIdentity(el);
    GM_setValue(REVIEW_LIST_CONTEXT,{listUrl:reviewListUrl(location.href),returnUrl:location.href,rowText:text,time:Date.now()});
  };
  var reviewNavigate = url => location.assign(url);
  var reviewSkipFill = async () => {
    if(unsafeWindow.__ZHS_STOP) return false;
    const info=reviewPracticeInfo(), saved=GM_getValue(REVIEW_LIST_CONTEXT,{});
    const context=saved.listUrl===info.listUrl && Date.now()-saved.time<3600000 &&
      (!info.title||saved.rowText?.includes(info.title))?saved:{};
    const listUrl=info.listUrl||reviewListUrl(context.listUrl);
    if(!listUrl || (!context.rowText&&!info.title)) {
      panelNotify('error','检测到填空题，但无法定位所属知识点；请从掌握度列表启动以便标记并跳过');return false;
    }
    const entry={...info,listUrl,rowText:context.rowText||'',reason:'含填空题',time:new Date().toISOString()};
    const db=GM_getValue(REVIEW_SKIP_STORE,{});db[JSON.stringify([listUrl,info.point||info.title||entry.rowText])]=entry;
    GM_setValue(REVIEW_SKIP_STORE,db);
    GM_setValue(REVIEW_PENDING,false);GM_setValue(REVIEW_HISTORY_OPEN,'');GM_setValue(REVIEW_RETURN,'');
    panelNotify('memory',`已标记“${info.title||entry.rowText}”：含填空题，跳过整套练习，返回列表继续`);
    const learningUrl=learnReturnUrl();
    const returnUrl=learningUrl||(reviewListUrl(context.returnUrl)===listUrl?context.returnUrl:listUrl);
    setLoopKey(true);reviewNavigate(returnUrl);
    return !!await reviewWait(()=>learningUrl?location.href===learningUrl:reviewListUrl(location.href)===listUrl,12000);
  };
  var reviewVisible = (el) => {
    if (!el || el.closest('[hidden], [aria-hidden="true"]')) return false;
    for (let node=el; node?.nodeType===1; node=node.parentElement) {
      const style=getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }
    return true;
  };
  var reviewText = (el) => (el?.innerText ?? el?.textContent ?? '').trim();
  var reviewNormalize = (text) => String(text || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  var reviewCanonical = (text) => reviewNormalize(text).replace(/\[img:([^\]]+)\]/g,(token,url)=>reviewImageHashes[url]?.hash?`[imgsha256:${reviewImageHashes[url].hash}]`:token).replace(/[\u200b\u200c\u200d\ufeff\u2060]/g,'')
    .replace(/\s+/g,(space,offset,whole) => /[A-Za-z0-9]/.test(whole[offset-1] || '') && /[A-Za-z0-9]/.test(whole[offset+space.length] || '') ? ' ' : '');
  var reviewStemKey = (text) => {
    let result=reviewNormalize(text);
    for (let i=0;i<4;i++) {
      result=result.replace(/^(?:第\s*\d+\s*题(?=\s|[：:、.．【(（])\s*[：:、.．]?|\d+(?:[、．]\s*|\.\s+))\s*/, '');
      const prefix=result.match(/^(?:【(?:单选题|多选题|判断题)】|[（(](?:单选题|多选题|判断题)[）)]|(?:单选题|多选题|判断题)(?:\s+|[：:]\s*))\s*/);
      if(prefix && result.slice(prefix[0].length).trim()) result=result.slice(prefix[0].length);
    }
    return reviewCanonical(result);
  };
  var reviewImageKey = (node) => {
    const source=node.getAttribute('data-src') || node.getAttribute('src') || '';
    try {
      const url=new URL(source,location.href);
      for (const key of [...url.searchParams.keys()]) if (/^(?:Expires|Signature|OSSAccessKeyId|x-oss-security-token|X-Amz-(?:Signature|Credential|Date|Expires|Security-Token|SignedHeaders|Algorithm))$/i.test(key)) url.searchParams.delete(key);
      url.searchParams.sort();
      return url.href;
    } catch (_) { return source; }
  };
  var reviewSvgKey = (node) => {
    const clone=node.cloneNode(true), ids=new Map();
    [clone,...clone.querySelectorAll('[id]')].forEach(el => { if(el.id&&!ids.has(el.id)) ids.set(el.id,`glyph${ids.size}`); });
    for(const el of [clone,...clone.querySelectorAll('*')]) for(const attr of [...el.attributes]) {
      if (/^(?:class|focusable|tabindex|aria-.+|data-v-.+)$/.test(attr.name) || (el===clone&&/^(?:width|height)$/.test(attr.name))) { el.removeAttribute(attr.name); continue; }
      if(attr.name==='style') {
        const remaining=attr.value.split(';').filter(part=>!/^\s*(?:width|height|font-size|font-family)\s*:/i.test(part)).join(';').trim();
        if(remaining) el.setAttribute('style',remaining);else el.removeAttribute('style');
        continue;
      }
      if(attr.name==='id') el.setAttribute('id',ids.get(attr.value));
      else if(attr.value.startsWith('#')&&ids.has(attr.value.slice(1))) el.setAttribute(attr.name,'#'+ids.get(attr.value.slice(1)));
      else if(/url\(#/.test(attr.value)) el.setAttribute(attr.name,attr.value.replace(/url\(#([^)]*)\)/g,(m,id)=>ids.has(id)?`url(#${ids.get(id)})`:m));
    }
    return clone.outerHTML;
  };
  var reviewSerialize = (node) => {
    if (!node) return '';
    if (node.nodeType === 3) return node.nodeValue || '';
    if (node.nodeType !== 1) return '';
    if (/^(SCRIPT|STYLE|BUTTON|INPUT)$/i.test(node.tagName)) return '';
    if (node.matches('.letterSortNum, .el-radio__input, .el-checkbox__input, .radio-icon, .radio-inner, .check-icon, .checkIcon, .checkbox-icon, .option-radio')) return '';
    if(node.matches('.radio-box') && !reviewNormalize(reviewText(node))) return '';
    if (node.tagName === 'IMG') return ` [img:${reviewImageKey(node)}] `;
    const math = node.querySelector('annotation[encoding="application/x-tex"]');
    if (node.matches('.katex, .MathJax') && math) return ` [tex:${math.textContent}] `;
    if (node.tagName.toUpperCase() === 'SVG') return ` [math:${reviewSvgKey(node)}] `;
    if (node.tagName === 'MATH') return ` [math:${node.outerHTML}] `;
    return [...node.childNodes].map(reviewSerialize).join('');
  };
  var reviewOptionLabel = (el,index) => {
    const marker=[...el.querySelectorAll('.letterSortNum,[class*="SortNum"],[class*="sort-num"],[data-option-label]')].find(node=>/^[A-H][.、．:：)）]?$/.test(reviewText(node)));
    const text=reviewText(marker || el.querySelector('.el-radio__label,.el-checkbox__label') || el);
    const explicit=text.match(/^([A-H])(?:[.、．:：)）]|\s|$)/)?.[1];
    return explicit || String.fromCharCode(65+index);
  };
  var reviewOptionKey = (el) => {
    const payload=(el.querySelector('.el-radio__label,.el-checkbox__label') || el).cloneNode(true);
    const first=[...payload.querySelectorAll('span,div,b')].find(node => /^[A-H][.、．:：)）]$/.test(reviewText(node)) ||
      (node.matches('.letterSortNum,[class*="SortNum"],[class*="sort-num"],[data-option-label]') && /^[A-H]$/.test(reviewText(node))));
    if(first && reviewNormalize(reviewText(payload)).startsWith(reviewText(first)) && reviewText(payload).length>reviewText(first).length) {
      // A control glyph before the A/B label is decoration, not an option's formula SVG.
      for(const svg of payload.querySelectorAll('svg')) if(svg.compareDocumentPosition(first)&4) svg.remove();
      first.remove();
    }
    return reviewCanonical(reviewSerialize(payload).replace(/^\s*[A-H](?:[.、．:：)）]|\s+(?=\S))\s*/, ''));
  };
  var reviewTruthValue = (text) => {
    if (/^(?:对|正确|是|√|true)$/i.test(text)) return '对';
    if (/^(?:错|错误|否|×|false)$/i.test(text)) return '错';
    return null;
  };
  var reviewCleanStem = (question,choices=[],labels=[]) => {
    let text;
    if(typeof question==='string') text=question;
    else if(question) {
      const boundary=[...question.querySelectorAll('ul.radio-view,.el-checkbox-group,.checkbox-view,[role="radiogroup"]')].find(reviewVisible);
      if(boundary) text=reviewStemBeforeGroup(question,boundary);
      else {
        const clone=question.cloneNode(true);
        clone.querySelectorAll('.upload,.el-upload,.qq-uploader,[class*="uploader"],[class*="upload-"],input[type="file"],button,script,style').forEach(node=>node.remove());
        text=reviewSerialize(clone);
      }
    } else text='';
    text=reviewStemKey(text);
    // Repair existing audit snapshots only when the entire known option sequence is a suffix.
    text=text.replace(/上传附件Processing dropped files\.\.\..*$/s,'');
    if(choices.length) {
      const escape=value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      const sequence=choices.map((choice,index)=>`(?:${escape(labels[index] || String.fromCharCode(65+index))}[.、．:：)）]?)?${escape(choice)}`).join('');
      const match=text.match(new RegExp(sequence+'$'));
      if(match && match.index>0) text=text.slice(0,match.index);
    }
    return reviewStemKey(text);
  };
  var reviewSnapshot = (question, options, multiple) => {
    let choices = options.map(reviewOptionKey);
    const labels=options.map(reviewOptionLabel);
    const stem = reviewCleanStem(question,choices,labels);
    if (!multiple && choices.length === 2) {
      const truth=choices.map(reviewTruthValue);
      if (truth.every(Boolean) && new Set(truth).size === 2) choices=truth;
    }
    if (!stem || choices.length < 2 || choices.some(x => !x) || new Set(choices).size !== choices.length || new Set(labels).size !== labels.length) return null;
    // Store the entire canonical signature: mathematical signs and case remain significant.
    return {stem, choices, labels, multiple: !!multiple,
      key: JSON.stringify([stem, !!multiple, [...choices].sort()])};
  };
  var reviewReadStore = () => {
    const db = GM_getValue(REVIEW_STORE, {});
    if(!db || typeof db!=='object' || Array.isArray(db)) return {};
    const normalized={};
    for(const [oldKey,record] of Object.entries(db)) {
      if(record?.source!=='platform-review' || !Array.isArray(record.answers)) continue;
      try {
        const [oldStem,multiple,oldChoices]=JSON.parse(oldKey);
        const stem=reviewStemKey(record.stem || oldStem), choices=(record.choices || oldChoices).map(reviewCanonical);
        if(!stem || !Array.isArray(choices) || choices.length<2) continue;
        const key=JSON.stringify([stem,!!multiple,[...choices].sort()]);
        const next={...record,stem,choices,multiple:!!multiple,answers:record.answers.map(reviewCanonical)};
        if(normalized[key] && JSON.stringify([...normalized[key].answers].sort())!==JSON.stringify([...next.answers].sort())) next.conflict=true;
        if(normalized[key]?.conflict) next.conflict=true;
        normalized[key]=next;
      } catch(_) {}
    }
    return normalized;
  };
  var reviewLookup = (snapshot) => {
    if (!snapshot) return null;
    const candidates=Object.entries(reviewReadStore()).filter(([key,record])=>record.stem===snapshot.stem && record.multiple===snapshot.multiple);
    const matches=[];
    for(const [key,record] of candidates) {
      if(record.conflict || !record.answers?.length || record.choices.length!==snapshot.choices.length) continue;
      const used=new Set(), indices=[];
      for(let i=0;i<snapshot.choices.length;i++) {
        const current=snapshot.choices[i], label=snapshot.labels?.[i] || String.fromCharCode(65+i);
        const exact=record.choices.map((choice,j)=>choice===current?j:-1).filter(j=>j>=0&&!used.has(j));
        const alternatives=exact.length ? exact : record.choices.map((choice,j)=>current.startsWith(label)&&current.slice(1)===choice?j:-1).filter(j=>j>=0&&!used.has(j));
        if(alternatives.length!==1) break;
        used.add(alternatives[0]);indices.push(alternatives[0]);
      }
      if(indices.length!==snapshot.choices.length) continue;
      const selected=record.answers.map(answer=>record.choices.indexOf(answer));
      if(selected.some(i=>i<0) || (!snapshot.multiple&&selected.length!==1)) continue;
      const letters=indices.map((old,i)=>selected.includes(old)?(snapshot.labels?.[i] || String.fromCharCode(65+i)):'').join('');
      matches.push({key,record,letters,indices});
    }
    if(matches.length!==1) return null;
    reviewLastMatch={snapshotKey:snapshot.key,...matches[0]};
    return matches[0].letters;
  };
  var reviewLastMatch=null;
  var reviewWaitStableQuiz = async (url) => {
    let last='',stable=0;
    return !!await reviewWait(()=>{
      if(location.href!==url || unsafeWindow.__ZHS_STOP) return false;
      const snapshot=reviewSnapshot(reviewQuizQuestion(),getQuizOptions(),isMultipleChoice());
      if(!snapshot) {last='';stable=0;return false;}
      const signature=JSON.stringify([snapshot.key,snapshot.choices,snapshot.labels]);
      stable=signature===last?stable+1:0;last=signature;
      return stable>=2;
    },5000);
  };
  var reviewRekeySnapshot = (snapshot) => {
    if(!snapshot) return null;
    const stem=reviewStemKey(snapshot.stem),choices=snapshot.choices.map(reviewCanonical);
    return {...snapshot,stem,choices,key:JSON.stringify([stem,!!snapshot.multiple,[...choices].sort()])};
  };
  var reviewImageTemplate = (text) => text.replace(/\[(?:img|imgsha256):[^\]]+\]/g,'[FORMULA]');
  var reviewHashBlob = async (blob) => {
    const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');
    try {
      const bitmap=await createImageBitmap(blob);
      try {
        const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
        const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(bitmap,0,0);
        const {data,width,height}=context.getImageData(0,0,canvas.width,canvas.height);
        let left=width,right=-1,top=height,bottom=-1;
        const rgb=new Uint8Array(width*height*3);
        for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
          const i=(y*width+x)*4,j=(y*width+x)*3,a=data[i+3];
          for(let c=0;c<3;c++) rgb[j+c]=Math.round((data[i+c]*a+255*(255-a))/255);
          if(rgb[j]!==255||rgb[j+1]!==255||rgb[j+2]!==255){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);}
        }
        if(right<left) { const error=new Error('空白公式图');error.code='BLANK_FORMULA';throw error; }
        const w=right-left+1,h=bottom-top+1,bytes=new Uint8Array(8+w*h*3);
        const header=new DataView(bytes.buffer);header.setUint32(0,w,true);header.setUint32(4,h,true);
        for(let y=0;y<h;y++)bytes.set(rgb.subarray(((top+y)*width+left)*3,((top+y)*width+left+w)*3),8+y*w*3);
        return 'pixels-v1:'+await digest(bytes);
      } finally { bitmap.close(); }
    } catch(error) {
      if(error.code==='BLANK_FORMULA') throw error;
      const bytes=await blob.arrayBuffer(),head=new Uint8Array(bytes).subarray(0,512);
      const text=String.fromCharCode(...head);
      const valid=(head[0]===137&&text.slice(1,4)==='PNG') || (head[0]===255&&head[1]===216) || /^GIF8/.test(text) || (/^RIFF/.test(text)&&text.slice(8,12)==='WEBP') || /<svg[\s>]/i.test(text);
      if(!valid) throw new Error('下载内容不是可识别的公式图片');
      return 'bytes-v1:'+await digest(bytes);
    }
  };
  var reviewFetchImageHash = (url) => new Promise((resolve,reject)=>{
    GM_xmlhttpRequest({method:'GET',url,responseType:'blob',anonymous:true,timeout:15000,
      onload:async response=>{
        if(response.status!==200) return reject(new Error(`图片 HTTP ${response.status}`));
        try{resolve(await reviewHashBlob(response.response));}catch(error){reject(error);}
      },onerror:()=>reject(new Error('公式图片下载失败')),ontimeout:()=>reject(new Error('公式图片下载超时'))});
  });
  var reviewWarmImageTexts = async (texts) => {
    reviewImageHashes={...reviewImageHashes,...GM_getValue(REVIEW_IMAGE_CACHE,{})};
    const urls=[...new Set(texts.flatMap(text=>[...String(text || '').matchAll(/\[img:([^\]]+)\]/g)].map(match=>match[1])))].filter(url=>!reviewImageHashes[url]?.hash);
    if(!urls.length) return;
    panelNotify('memory',`正在核对 ${urls.length} 张公式图片的实际内容（首次会缓存）`);
    let next=0,failed=0;
    await Promise.all(Array.from({length:Math.min(6,urls.length)},async()=>{
      while(next<urls.length&&!unsafeWindow.__ZHS_STOP) {
        const url=urls[next++];setLoopKey(true);
        try{reviewImageHashes[url]={hash:await reviewFetchImageHash(url),checkedAt:Date.now()};}catch(error){failed++;reviewImageHashes[url]={error:error.message,checkedAt:Date.now()};}
      }
    }));
    GM_setValue(REVIEW_IMAGE_CACHE,{...GM_getValue(REVIEW_IMAGE_CACHE,{}),...reviewImageHashes});
    if(failed) panelNotify('memory',`${failed} 张公式图尚未核对成功；不会仅凭相似文字套用公式答案`);
  };
  var reviewPrepareReference = async (snapshot) => {
    if(!snapshot) return null;
    const template=reviewImageTemplate(snapshot.stem);
    const candidates=Object.values(reviewReadStore()).filter(record=>record.multiple===snapshot.multiple&&reviewImageTemplate(record.stem)===template);
    await reviewWarmImageTexts([snapshot.stem,...snapshot.choices,...candidates.flatMap(record=>[record.stem,...record.choices])]);
    return reviewRekeySnapshot(snapshot);
  };
  var reviewSave = (snapshot, letters) => {
    if (!snapshot || !letters?.length || (!snapshot.multiple && letters.length !== 1)) return false;
    const labels=snapshot.labels || snapshot.choices.map((_,i)=>String.fromCharCode(65+i));
    const indices = [...new Set(letters)].map(letter => labels.indexOf(letter));
    if (indices.some(i => i < 0 || i >= snapshot.choices.length)) return false;
    const answers = indices.map(i => snapshot.choices[i]).sort();
    const db = reviewReadStore();
    const previous = db[snapshot.key];
    if (previous && JSON.stringify([...previous.answers].sort()) !== JSON.stringify(answers)) {
      previous.conflict = true;
      GM_setValue(REVIEW_STORE, db);
      reviewLog('同题出现不同的公布答案，已暂停复用该题');
      return false;
    }
    if (previous?.conflict) return false;
    db[snapshot.key] = {schema:2,stem:snapshot.stem,choices:snapshot.choices,multiple:snapshot.multiple,
      answers,sourceLetters:[...letters].join(''),sourceLabels:labels,sourcePath:location.pathname,
      source: 'platform-review', savedAt: Date.now()};
    // Bound storage; evict old records rather than writing an unbounded object.
    const keys = Object.keys(db).sort((a,b) => db[b].savedAt-db[a].savedAt);
    for (const key of keys.slice(1500)) delete db[key];
    GM_setValue(REVIEW_STORE, db);
    return true;
  };
  var reviewShortId = (snapshot) => {
    let value=2166136261;
    for(const char of snapshot?.key || '') value=Math.imul(value^char.charCodeAt(0),16777619);
    return (value>>>0).toString(16).padStart(8,'0');
  };
  var reviewGetStats = () => GM_getValue('zhs_reference_stats_v1',{hits:0,ai:0,blocked:0,seen:{},closed:false});
  var reviewResetStats = () => GM_setValue('zhs_reference_stats_v1',{hits:0,ai:0,blocked:0,seen:{},closed:false});
  var reviewMissReason = (snapshot) => {
    if(!snapshot) return {block:true,reason:'题干或选项无法唯一识别'};
    const db=reviewReadStore(), exact=db[snapshot.key];
    if(exact?.conflict) return {block:true,reason:'本地参考答案存在冲突'};
    const sameStem=Object.values(db).filter(record=>record.stem===snapshot.stem&&record.multiple===snapshot.multiple);
    if(sameStem.length) return {block:true,reason:'找到同题题干，但当前选项无法与参考答案一一对应'};
    const sameOptions=Object.values(db).filter(record=>record.multiple===snapshot.multiple&&JSON.stringify([...record.choices].sort())===JSON.stringify([...snapshot.choices].sort()));
    const sameTemplate=Object.values(db).filter(record=>record.multiple===snapshot.multiple&&reviewImageTemplate(record.stem)===reviewImageTemplate(snapshot.stem));
    if(sameTemplate.length && /\[img:/.test([snapshot.stem,...snapshot.choices,...sameTemplate.flatMap(record=>[record.stem,...record.choices])].join('')))
      return {block:true,reason:'文字对应，但部分公式图片尚未完成内容核对，请检查网络后重试'};
    return {block:false,reason:sameOptions.length?'选项集合曾出现，但题干不同；不借用其他题的答案':'本地尚无该题参考答案'};
  };
  var reviewAudit = (snapshot, source, letters, extra={}) => {
    const record=snapshot && (reviewReadStore()[snapshot.key] || (source==='platform-review'&&reviewLastMatch?.snapshotKey===snapshot.key?reviewLastMatch.record:null));
    const correspondence=source==='platform-review'&&reviewLastMatch?.snapshotKey===snapshot?.key ? snapshot.choices.map((content,i)=>({
      currentLabel:snapshot.labels[i],currentContent:content,referenceContent:reviewLastMatch.record.choices[reviewLastMatch.indices[i]],
      isAnswer:reviewLastMatch.record.answers.includes(reviewLastMatch.record.choices[reviewLastMatch.indices[i]])})) : [];
    const entry={time:new Date().toISOString(),question:reviewShortId(snapshot),key:snapshot?.key || '',
      stem:snapshot?.stem || '',choices:snapshot?.choices || [],labels:snapshot?.labels || [],source,
      referenceLetters:record?.sourceLetters || '',referenceLabels:record?.sourceLabels || [],
      referenceAnswers:record?.answers || [],referencePath:record?.sourcePath || '',
      appliedLetters:letters || '',correspondence,...extra};
    const trace=GM_getValue('zhs_reference_audit_v1',[]);
    GM_setValue('zhs_reference_audit_v1',[...(Array.isArray(trace)?trace:[]),entry].slice(-60));
    let stats=reviewGetStats();
    if(stats.closed) { reviewResetStats();stats=reviewGetStats(); }
    const field=source==='platform-review'?'hits':source==='ai'?'ai':source==='blocked'?'blocked':null;
    if(field) {
      const previous=stats.seen?.[snapshot?.key];
      if(previous!==field) {
        if(previous) stats[previous]=Math.max(0,(stats[previous] || 0)-1);
        stats[field]=(stats[field] || 0)+1;
      }
      stats.seen={...(stats.seen || {}),[snapshot?.key || entry.question]:field};
      GM_setValue('zhs_reference_stats_v1',stats);
    }
    const prefix=`题目 ${entry.question}「${entry.stem.slice(0,46)}」`;
    if(source==='platform-review') {
      const mapped=(extra.selected || []).map(x=>`${x.letter}=${x.content.slice(0,50)}`).join('；');
      panelNotify('memory',`${prefix}：使用参考答案，已核对勾选 ${letters}（原解析 ${entry.referenceLetters || '按内容映射'}）；${mapped}`);
    } else if(source==='ai') panelNotify('memory',`${prefix}：未命中参考答案，本题使用 AI ${letters}`);
    else if(source==='miss') panelNotify('memory',`${prefix}：${extra.reason}，转交 AI`);
    else if(source==='blocked') panelNotify('memory',`${prefix}：${extra.reason}，停止以免错配`);
    return entry;
  };
  var reviewAuditReport = () => ({version:'1.1.1-beta.1',stats:reviewGetStats(),
    navigation:{current:reviewPracticeInfo(),listContext:GM_getValue(REVIEW_LIST_CONTEXT,null),sequence:GM_getValue(REVIEW_SEQUENCE,null)},
    learningNavigation:{state:GM_getValue(LEARN_STATE,null),catalog:GM_getValue('zhs_catalog_scan_v1',null),entry:GM_getValue('zhs_learn_entry_v1',null)},
    questionChange:GM_getValue('zhs_question_change_v1',null),
    formulaVerification:{verified:Object.values(reviewImageHashes).filter(x=>x?.hash).length,
      failed:Object.entries(reviewImageHashes).filter(([,x])=>x?.error).map(([url,x])=>({url,error:x.error}))},
    references:Object.entries(reviewReadStore()).map(([key,record])=>({question:reviewShortId({key}),...record})),
    trace:GM_getValue('zhs_reference_audit_v1',[])});
  var reviewParsePublished = (text, count, multiple, choices=[],labels=[]) => {
    const judgment=String(text || '').trim().match(/^(?:正确答案|参考答案|标准答案)\s*[：:]?\s*(对|错|正确|错误|是|否|√|×|true|false)(?=\s*(?:$|答案解析|解析|[。；;\n]))/i);
    if (judgment && !multiple && choices.length === 2) {
      const truth=choices.map(reviewTruthValue), wanted=reviewTruthValue(judgment[1]);
      if (truth.every(Boolean) && new Set(truth).size === 2 && truth.includes(wanted))
        return [labels[truth.indexOf(wanted)] || String.fromCharCode(65+truth.indexOf(wanted))];
    }
    const match = String(text || '').trim().match(/^(?:正确答案|参考答案|标准答案)\s*[：:]?\s*([A-H](?:[\s,，、;；]*[A-H])*)(?=\s*(?:$|[。；;\n]|我的答案|你的答案|学生答案|作答|答案解析|解析|得分|本题))/);
    // A strict, separately anchored fallback for a dedicated answer row.
    const row = String(text || '').match(/^(?:正确答案|参考答案|标准答案)\s*[：:]?\s*([A-H](?:[\s,，、;；]*[A-H])*)\s*$/);
    const m = row || match;
    if (!m) return null;
    const letters = [...new Set(m[1].replace(/[^A-H]/g, '').split(''))];
    if (!letters.length || (!multiple && letters.length !== 1) || letters.some(x => labels.length ? !labels.includes(x) : x.charCodeAt(0)-65 >= count)) return null;
    return letters;
  };
  var reviewOptionsIn = (root) => {
    const checkboxes = [...root.querySelectorAll('.el-checkbox-group.checkbox-view .el-checkbox')];
    if (checkboxes.length) return {options: checkboxes, multiple: true};
    return {options: [...root.querySelectorAll('ul.radio-view li')], multiple: false};
  };
  var reviewFindPublished = (scope, count, multiple, choices=[],labels=[]) => {
    const rows = [...scope.querySelectorAll('div,p,span,li')]
      .filter(el => reviewVisible(el) && /(?:正确答案|参考答案|标准答案)/.test(reviewText(el)) && reviewText(el).length < 220)
      .sort((a,b) => reviewText(a).length-reviewText(b).length);
    for (const row of rows) {
      // Avoid reading the stem itself as the answer.
      if (row.closest('.questionContent') || row.querySelector('.questionContent')) continue;
      const answer = reviewParsePublished(reviewText(row), count, multiple, choices,labels);
      if (answer) return answer;
    }
    return null;
  };
  var REVIEW_GROUP_SELECTOR='.el-radio-group,.el-checkbox-group,[role="radiogroup"],[role="group"][aria-label="checkbox-group"]';
  var reviewPreviewOptions = (group) => {
    const multiple=group.matches('.el-checkbox-group,[aria-label="checkbox-group"]') || !!group.querySelector('input[type="checkbox"],[role="checkbox"]');
    let options=[...group.querySelectorAll(multiple ? '.el-checkbox,[role="checkbox"]' : '.el-radio,[role="radio"]')];
    options=options.filter(node => !options.some(other => other !== node && other.contains(node)));
    if (!options.length) options=[...group.querySelectorAll(multiple ? 'input[type="checkbox"]' : 'input[type="radio"]')].map(node => node.closest('label') || node.parentElement);
    return {multiple, options:[...new Set(options)]};
  };
  var reviewStemBeforeGroup = (scope, group) => {
    let stopped=false;
    const walk=node => {
      if (node === group) { stopped=true; return ''; }
      if (stopped) return '';
      if (node.nodeType === 3) return node.nodeValue || '';
      if (node.nodeType !== 1) return '';
      if (node.matches('button,input,script,style,#zhs-panel-host')) return '';
      const text=reviewNormalize(reviewText(node));
      if (/^(?:单选题|多选题|判断题|AI答题辅导|收藏为薄弱题)$/.test(text)) return '';
      if (node.matches('img,svg,math,.katex,.MathJax')) return reviewSerialize(node);
      return [...node.childNodes].map(walk).join('');
    };
    return reviewNormalize(walk(scope))
      .replace(/^(?:(?:单选题|多选题|判断题|AI答题辅导|收藏为薄弱题)\s*)+/, '');
  };
  var reviewUnits = () => {
    const roots = [...document.querySelectorAll('.questionContent')].filter(reviewVisible);
    const legacy=roots.map(question => {
      let scope = question.parentElement;
      let candidate={scope, snapshot:null, letters:null, question};
      while (scope && scope !== document.body && scope !== document.documentElement) {
        // A multi-question page must never share answers across cards.
        if (scope.querySelectorAll('.questionContent').length > 1) break;
        const {options, multiple} = reviewOptionsIn(scope);
        if (options.length >= 2) {
          const snapshot=reviewSnapshot(question, options, multiple);
          const letters = reviewFindPublished(scope, options.length, multiple, snapshot?.choices,snapshot?.labels);
          candidate={scope, snapshot, letters, question};
          if (letters && snapshot) break;
        }
        scope = scope.parentElement;
      }
      return candidate;
    });
    const groups=[...document.querySelectorAll(REVIEW_GROUP_SELECTOR)].filter(group =>
      reviewVisible(group) && !group.closest('#zhs-panel-host') &&
      !groupsContainParent(group));
    function groupsContainParent(group) { return !!group.parentElement?.closest(REVIEW_GROUP_SELECTOR); }
    const preview=groups.map(group => {
      const {options,multiple}=reviewPreviewOptions(group);
      if (options.length < 2) return null;
      let scope=group.parentElement, candidate=null;
      while (scope && scope !== document.body && scope !== document.documentElement) {
        if (scope.querySelectorAll(REVIEW_GROUP_SELECTOR).length > 1) break;
        if (scope.querySelector('.questionContent')) return null; // Already handled by legacy reader.
        const stemNode=[...scope.querySelectorAll('.question-content,.question-title,.question-stem,[data-question-content]')]
          .find(node => !node.contains(group) && !group.contains(node));
        const question=stemNode || reviewStemBeforeGroup(scope,group);
        const snapshot=reviewSnapshot(question,options,multiple);
        const letters=reviewFindPublished(scope,options.length,multiple,snapshot?.choices,snapshot?.labels);
        candidate={scope,question,snapshot,letters,group};
        if (letters && snapshot) break;
        scope=scope.parentElement;
      }
      return candidate;
    }).filter(Boolean);
    return [...legacy,...preview].map(unit => {
      const raw=typeof unit.question === 'string' ? unit.question : reviewSerialize(unit.question);
      unit.identity=unit.snapshot?.key || reviewStemKey(raw);
      return unit;
    });
  };
  var reviewCards = () => reviewUnits().filter(unit => unit.snapshot && unit.letters);
  var reviewIsHistory = () => /\/masteryHistory\//.test(location.pathname);
  var reviewIsPage = () => {
    if (reviewIsHistory()) return false;
    if (/\/(?:analysis|review|examAnalysis|answerAnalysis|examPreview)(?:\/|$)/i.test(location.pathname)) return true;
    return [...document.querySelectorAll('span,div,p')].some(el => reviewVisible(el) &&
      !el.closest('.questionContent,#zhs-panel-host') && !el.querySelector('.questionContent') &&
      /^(?:正确答案|参考答案|标准答案)\s*[：:]?/.test(reviewText(el)) && reviewText(el).length < 220);
  };
  var reviewButton = (pattern) => [...document.querySelectorAll('button,a,[role="button"],span,div')]
    .filter(el => reviewVisible(el) && !el.closest('#zhs-panel-host') &&
      !el.matches('[disabled],.is-disabled,[aria-disabled="true"]') && pattern.test(reviewText(el)))
    .sort((a,b) => a.querySelectorAll('*').length-b.querySelectorAll('*').length)[0] || null;
  var reviewWait = async (fn, timeout=12000) => {
    const start = Date.now();
    while (Date.now()-start < timeout) {
      if (unsafeWindow.__ZHS_STOP) return null;
      setLoopKey(true);
      const value = fn();
      if (value) return value;
      await sleep(200);
    }
    return null;
  };
  var reviewCollectVisible = () => {
    const cards = reviewCards();
    let saved = 0;
    for (const card of cards) if (reviewSave(card.snapshot, card.letters)) saved++;
    return {cards, saved};
  };
  var reviewScrollTargets = (units) => {
    const targets=new Set();
    const doc=document.scrollingElement || document.documentElement;
    if (doc.scrollHeight > doc.clientHeight+2) targets.add(doc);
    for (const unit of units) {
      for (let node=unit.scope; node && node !== document.body; node=node.parentElement) {
        if (node.closest('#zhs-panel-host')) break;
        const style=getComputedStyle(node);
        if (/(?:auto|scroll)/.test(style.overflowY) && node.scrollHeight > node.clientHeight+2)
          targets.add(node);
      }
    }
    return [...targets];
  };
  var reviewScanPage = async () => {
    const found=new Map();
    const observe=() => {
      const units=reviewUnits();
      for (const unit of units) {
        const old=found.get(unit.identity);
        if (!old || (unit.snapshot && unit.letters)) found.set(unit.identity,unit);
      }
      return units;
    };
    const targets=reviewScrollTargets(observe());
    const positions=targets.map(node => [node,node.scrollTop]);
    let complete=true;
    try {
      for (const node of targets) {
        node.scrollTop=0;
        await sleep(200);
        let bottomStable=0;
        for (let step=0; step<100; step++) {
          if (unsafeWindow.__ZHS_STOP) return {aborted:true};
          setLoopKey(true);
          observe();
          const bottom=Math.max(0,node.scrollHeight-node.clientHeight);
          if (node.scrollTop >= bottom-2) {
            if (++bottomStable >= 3) break;
          } else bottomStable=0;
          if (step === 99) { complete=false; break; }
          node.scrollTop=Math.min(bottom,node.scrollTop+Math.max(320,Math.floor(node.clientHeight*0.8)));
          if (step%5 === 0) reviewLog(`正在扫描整页解析，已发现 ${found.size} 道题`);
          await sleep(250);
        }
      }
      // A final pass includes late-loaded images, formulas, and reference-answer rows.
      await sleep(200);
      observe();
    } finally {
      for (const [node,top] of positions) node.scrollTop=top;
    }
    if (unsafeWindow.__ZHS_STOP) return {aborted:true};
    let saved=0;
    await reviewWarmImageTexts([...found.values()].flatMap(unit=>unit.snapshot?[unit.snapshot.stem,...unit.snapshot.choices]:[]));
    if(unsafeWindow.__ZHS_STOP) return {aborted:true};
    for (const unit of found.values()) if (reviewSave(reviewRekeySnapshot(unit.snapshot),unit.letters)) saved++;
    return {saved,expected:found.size,complete};
  };
  var reviewLayoutDiagnostic = () => {
    if(learnRoute()) {
      const root=learnCatalogRoot(),clone=root?.cloneNode(true);
      clone?.querySelectorAll('script,style,iframe,input,textarea,#zhs-panel-host').forEach(el=>el.remove());
      return {version:'1.1.1-beta.1',page:'learnPage',path:location.pathname,title:learnTitle(),mastery:learnMastery(),
        state:GM_getValue(LEARN_STATE,null),entry:GM_getValue('zhs_learn_entry_v1',null),catalogHTML:clone?.outerHTML.slice(0,200000)||'',
        lastScan:GM_getValue('zhs_catalog_scan_v1',null)};
    }
    const groups=[...document.querySelectorAll(REVIEW_GROUP_SELECTOR)].filter(node => !node.closest('#zhs-panel-host'));
    const samples=groups.slice(0,12).map(group => {
      let scope=group.parentElement;
      while (scope?.parentElement && scope.parentElement !== document.body &&
        scope.parentElement.querySelectorAll(REVIEW_GROUP_SELECTOR).length === 1) scope=scope.parentElement;
      const clone=(scope || group).cloneNode(true);
      clone.querySelectorAll('script,style,iframe,#zhs-panel-host').forEach(node => node.remove());
      clone.querySelectorAll('input,textarea').forEach(node => { node.removeAttribute('value'); node.textContent=''; });
      return clone.outerHTML.slice(0,100000);
    });
    return {version:'1.1.1-beta.1',path:location.pathname,groups:groups.length,
      parsed:reviewUnits().map(unit => ({stem:unit.snapshot?.stem || '',choices:unit.snapshot?.choices || [],answer:unit.letters})),samples};
  };
  var reviewRunPage = async () => {
    if(reviewHasFill()) return reviewSkipFill();
    // Preview uses Element Plus option groups, while the answering page uses radio-view.
    // Read DOM beyond the viewport and sweep scroll containers for lazy-loaded questions.
    let lastSignature='', stable=0;
    const ready=await reviewWait(() => {
      if ([...document.querySelectorAll('.el-loading-spinner')].some(reviewVisible)) return null;
      if(reviewHasFill()) return true;
      const units=reviewUnits();
      if (!units.length) return null;
      const signature=JSON.stringify(units.map(x => [x.identity,x.snapshot?.key,x.letters]));
      stable=signature===lastSignature ? stable+1 : 0;
      lastSignature=signature;
      return stable>=2;
    });
    if (!ready) {
      panelNotify('error', '未找到可识别的整页题目，请停留在解析页核对布局');
      return false;
    }
    if (unsafeWindow.__ZHS_STOP) return false;
    if(reviewHasFill()) return reviewSkipFill();
    const result=await reviewScanPage();
    if(reviewHasFill()) return reviewSkipFill();
    if (result.aborted) return false;
    const total=result.saved;
    const expected=result.expected;
    if (!result.complete || !total || total < expected) {
      panelNotify('error', `已保存 ${total}/${expected} 道题；部分题目、选项或公布答案未识别，已停留在解析页`);
      return false;
    }
    GM_setValue(REVIEW_PENDING, false);
    if(learnReturnUrl()) {const state=GM_getValue(LEARN_STATE,null);GM_setValue(LEARN_STATE,{...state,phase:'ready'});}
    const historyKey=GM_getValue(REVIEW_HISTORY_OPEN, '');
    if (historyKey) { GM_setValue(REVIEW_HISTORY_DONE, historyKey); GM_setValue(REVIEW_HISTORY_OPEN, ''); }
    reviewLog(`本次解析已保存 ${total}/${expected} 道题；题库共 ${Object.keys(reviewReadStore()).length} 道题`);
    const back = GM_getValue(REVIEW_RETURN, '');
    if (back && back !== location.href) {
      GM_setValue(REVIEW_RETURN, '');
      // Only return to a URL captured in this browser on an explicitly allowed platform.
      try {
        const parsed = new URL(back);
        if (parsed.protocol === 'https:' && ['ai-smart-course-student-pro.zhihuishu.com','studentexamcomh5.zhihuishu.com','examloop.zhihuishu.com'].includes(parsed.hostname)) {
          const old=location.href;
          const close=reviewButton(/^(?:返回|返回成绩|返回报告|返回列表|关闭解析)$/) || document.querySelector('.backup-icon');
          if (close && reviewVisible(close)) click(close);
          else history.back();
          const returned=await reviewWait(() => location.href !== old || !reviewIsPage(), 10000);
          if (!returned) { panelNotify('error', '已记住答案；请手动返回历史页后继续'); return false; }
          return true;
        }
      } catch (_) {}
    }
    setLoopKey(false);
    return true;
  };
  var reviewHistoryState = () => {
    if ([...document.querySelectorAll('.el-loading-spinner')].some(reviewVisible)) return null;
    const button=reviewButton(/^查看解析$/);
    if (button) return {button};
    const empty=[...document.querySelectorAll('div,span,p')].some(el =>
      reviewVisible(el) && !el.closest('#zhs-panel-host') &&
      /^(?:暂无数据|暂无记录|暂无练习记录|暂无历史记录|暂无历史数据|暂无掌握度历史记录)$/.test(reviewText(el)));
    return empty ? {empty: true} : null;
  };
  var reviewStartPractice = async () => {
    if (unsafeWindow.__ZHS_STOP) return false;
    const improve=reviewButton(/^去提升\s*[→➜➔>]?$|^去提升\s*$/) ||
      [...document.querySelectorAll('.improve-btn')].find(reviewVisible);
    if (!improve) { panelNotify('error', '历史页未找到“去提升”'); return false; }
    const old=location.href;
    reviewResetStats();
    setLoopKey(true);
    click(improve);
    const changed=await reviewWait(() => location.href !== old || !reviewIsHistory());
    if (!changed && !unsafeWindow.__ZHS_STOP) panelNotify('error', '已点击“去提升”，但页面未跳转');
    return !!changed;
  };
  var reviewRunHistory = async () => {
    if(learnReturnUrl()) {
      const pct=learnReadPublishedMastery();if(pct!==null)learnRecordMastery(pct);
      if(learnKnownMastery()>=getThreshold()) {
        learnClearPending();panelNotify('memory',`当前知识点掌握度 ${learnKnownMastery()}%，返回目录进入下一节`);
        return learnReturn();
      }
    }
    if(GM_getValue(LEARN_STATE,null)?.phase==='ready' && !GM_getValue(REVIEW_PENDING,false) && learnReturnUrl())return learnReturn();
    // An empty history is normal before the first practice, not a missing-selector error.
    // Let loading finish and require the explicit empty state to settle before skipping review.
    let emptyChecks=0;
    const state=await reviewWait(() => {
      const current=reviewHistoryState();
      if (!current) { emptyChecks=0; return null; }
      if (current.button) return current;
      return ++emptyChecks >= 3 ? current : null;
    });
    if (!state) {
      if (!unsafeWindow.__ZHS_STOP) panelNotify('error', '历史记录尚未加载，或解析入口无法识别，请稍后重试');
      return false;
    }
    if (state.empty) {
      GM_setValue(REVIEW_HISTORY_OPEN, '');
      GM_setValue(REVIEW_RETURN, '');
      panelNotify('memory', '暂无练习历史，先去提升；完成练习后再读取解析');
      return reviewStartPractice();
    }
    const latest=state.button;
    let row=latest;
    while (row?.parentElement && row.parentElement !== document.body) {
      if ((reviewText(row).match(/查看解析/g) || []).length > 1) break;
      if (/\d{4}-\d{2}-\d{2}/.test(reviewText(row))) break;
      row=row.parentElement;
    }
    const historyKey=JSON.stringify([location.href, reviewText(row)]);
    if (GM_getValue(REVIEW_PENDING, false) || GM_getValue(REVIEW_HISTORY_DONE, '') !== historyKey) {
      const button=latest;
      GM_setValue(REVIEW_RETURN, location.href);
      GM_setValue(REVIEW_HISTORY_OPEN, historyKey);
      reviewLog('打开最新一次练习解析');
      click(button);
      const opened = await reviewWait(() => reviewIsPage() || (location.href !== GM_getValue(REVIEW_RETURN, '') && !reviewIsHistory()));
      if (!opened) { panelNotify('error', '解析未在当前页面打开，请切到解析页后点开始/继续'); return false; }
      return true;
    }
    return reviewStartPractice();
  };
  var reviewVerifiedOptions = new WeakMap();
  var reviewQuizQuestion = () => {
    const active=[...document.querySelectorAll('.questionContent')].filter(reviewVisible);
    return active.length===1 ? active[0] : null;
  };
  var reviewCurrentQuiz = () => {
    const question=reviewQuizQuestion();
    if(!question) return null;
    for(let scope=question.parentElement;scope;scope=scope.parentElement) {
      if([...scope.querySelectorAll('.questionContent')].filter(reviewVisible).length>1) return null;
      const checks=[...scope.querySelectorAll('.el-checkbox-group.checkbox-view .el-checkbox')].filter(reviewVisible);
      const radios=[...scope.querySelectorAll('ul.radio-view li')].filter(reviewVisible);
      if(checks.length && radios.length) return null;
      if(checks.length>=2) return {question,options:checks,multiple:true};
      if(radios.length>=2) return {question,options:radios,multiple:false};
      if(scope===document.body) break;
    }
    return null;
  };
  getQuizOptions = () => reviewCurrentQuiz()?.options || [];
  isMultipleChoice = () => reviewCurrentQuiz()?.multiple || false;
  var reviewStateNodes = (option) => [option, ...option.querySelectorAll(
    'input,[role="radio"],[role="checkbox"],[aria-checked],[aria-selected],[data-state],[data-checked],[data-selected],i,svg,circle,path,use,[class*="radio"],[class*="check"],[class*="select"],[class*="circle"],[class*="icon"]'
  )];
  var reviewMarkerSignature = (option) => JSON.stringify(reviewStateNodes(option).map(node => {
    // Focus and hover do not prove that an answer was selected.
    const classes=[...node.classList].filter(c => !/(?:^|[-_])(?:focus|focused|hover|hovered)(?:$|[-_])/i.test(c)).sort();
    return [node.tagName, classes, node.getAttribute('aria-checked'), node.getAttribute('aria-selected'),
      node.getAttribute('data-state'), node.getAttribute('data-checked'), node.getAttribute('data-selected'),
      node.tagName === 'INPUT' ? node.checked : null,
      node === option ? '' : node.getAttribute('style') || '',
      node.querySelectorAll('svg,circle,path,use,i').length,
      ...['fill','stroke','href','d','transform'].map(attr => node.getAttribute(attr)),
      // Icon fonts often change only their private-use character, not any class.
      node.matches('.checkIcon,i.iconfont,.radio-icon,.checkbox-icon') ? node.textContent.trim() : ''];
  }));
  var reviewOptionState = (option) => {
    const controls=[...(option.matches('input[type="radio"],input[type="checkbox"]') ? [option] : []),
      ...option.querySelectorAll('input[type="radio"],input[type="checkbox"]')];
    if (controls.length) return {known: true, selected: controls.some(x => x.checked), proof: 'native-input'};
    const nodes=reviewStateNodes(option);
    let knownFalse=false;
    for (const node of nodes) {
      for (const attr of ['aria-checked','aria-selected','data-checked','data-selected']) {
        const value=node.getAttribute(attr);
        if (value === 'true' || value === '1') return {known: true, selected: true, proof: attr};
        if (value === 'false' || value === '0') knownFalse=true;
      }
      const state=node.getAttribute('data-state');
      if (state === 'checked' || state === 'selected') return {known: true, selected: true, proof: 'data-state'};
      if (state === 'unchecked' || state === 'unselected') knownFalse=true;
      for (const token of node.classList) {
        if (/^(?:is-checked|is-selected|checked|selected|active|on|current|radioChecked|radioSelected|isChecked|isSelected|icon-danxuanxuanzhong|icon-fuxuanxuanzhong|icon-xuanzhong)$/.test(token) ||
            /(?:^|[-_])(?:radio|checkbox|check|option|select)(?:[-_](?:icon|button|inner))?[-_](?:checked|selected|select|chosen|active|on|true)$/.test(token))
          return {known: true, selected: true, proof: `class:${token}`};
        if (/(?:^|[-_])(?:unchecked|unselected)$/.test(token)) knownFalse=true;
      }
    }
    const verified=reviewVerifiedOptions.get(option);
    if (!knownFalse && verified && verified.signature === reviewMarkerSignature(option))
      return {known: true, selected: verified.selected, proof: 'verified-marker-change'};
    return {known: knownFalse, selected: false, proof: knownFalse ? 'explicit-unselected' : 'unknown'};
  };
  var reviewRememberSelection = (option, selected) =>
    reviewVerifiedOptions.set(option, {signature: reviewMarkerSignature(option), selected});
  var reviewSelectionAttempts = [];
  var reviewSelectionDiagnostic = (opts, letters) => {
    const report={version:'1.1.1-beta.1', path:location.pathname, requested:letters,
      options:opts.map((option,index) => ({letter:reviewOptionLabel(option,index),
        connected:option.isConnected, state:reviewOptionState(option),
        controls:JSON.parse(reviewMarkerSignature(option))})),attempts:reviewSelectionAttempts};
    GM_setValue('zhs_last_selection_debug_v1', report);
    return report;
  };
  var reviewApplyLetters = async (letters, opts, multiple) => {
    reviewSelectionAttempts=[];
    const wanted = new Set(letters);
    if ((!multiple && wanted.size !== 1) || !wanted.size) throw new Error('答案选项数量不合规');
    const bound=reviewSnapshot(reviewQuizQuestion(),opts,multiple);
    if(!bound || [...wanted].some(letter=>!bound.labels.includes(letter))) throw new Error('当前题目或选项标签无法唯一对应');
    const assertCurrent = () => {
      const current=getQuizOptions(), snapshot=reviewSnapshot(reviewQuizQuestion(),current,isMultipleChoice());
      if(!snapshot || snapshot.key!==bound.key || JSON.stringify(snapshot.choices)!==JSON.stringify(bound.choices) || JSON.stringify(snapshot.labels)!==JSON.stringify(bound.labels))
        throw new Error('勾选期间题目或选项发生变化，已停止');
      return current;
    };
    for (let i=0; i<opts.length; i++) {
      if (unsafeWindow.__ZHS_STOP) throw new Error('已停止');
      const select=wanted.has(bound.labels[i]);
      const optionNow = () => assertCurrent()[i];
      const checked = () => reviewOptionState(optionNow()).selected;
      if (multiple) {
        if (checked() !== select) {
          const option=optionNow(), before=reviewMarkerSignature(option);
          click(option);
          const changed=await reviewWait(() => {
            const current=optionNow(), state=reviewOptionState(current);
            if (state.known) return state.selected === select;
            if (reviewMarkerSignature(current) !== before) { reviewRememberSelection(current, select); return true; }
            return false;
          }, 3000);
          if (!changed) { reviewSelectionDiagnostic(getQuizOptions(),letters); throw new Error('多选项状态未确认，请用菜单导出选项排查信息'); }
        }
      } else if (select && !checked()) {
        let changed=false;
        // Re-query after every wait: Vue may replace both the row and its icon.
        // Retry only a single-choice target; never blindly toggle a checkbox twice.
        for(let attempt=0;attempt<2&&!changed;attempt++) {
          if(unsafeWindow.__ZHS_STOP) throw new Error('已停止');
          if(checked()) { changed=true;break; }
          const option=optionNow(), before=reviewMarkerSignature(option);
          const target=attempt===0 ? option : option.querySelector('.checkIcon,input[type="radio"],.el-radio__label,.radio-icon') || option;
          const entry={attempt:attempt+1,letter:bound.labels[i],target:target.tagName,before:JSON.parse(before)};
          reviewSelectionAttempts.push(entry);
          click(target);
          changed=!!await reviewWait(() => {
            const current=optionNow(), state=reviewOptionState(current);
            if (state.known) return state.selected;
            if (reviewMarkerSignature(current) !== before) { reviewRememberSelection(current, true); return true; }
            return false;
          }, 5000);
          entry.after=JSON.parse(reviewMarkerSignature(optionNow()));
          entry.confirmed=changed;
          if(!changed&&attempt===0) panelNotify('memory','单选尚未确认，重新定位该选项的控件后重试一次');
        }
        if (!changed) { reviewSelectionDiagnostic(getQuizOptions(),letters); throw new Error('单选项状态未确认，请用菜单导出选项排查信息'); }
      }
    }
    const current=assertCurrent();
    const selected=current.map((option,index)=>({letter:bound.labels[index],content:bound.choices[index],state:reviewOptionState(option)})).filter(x=>x.state.selected);
    if(JSON.stringify(selected.map(x=>x.letter).sort())!==JSON.stringify([...wanted].sort())) {
      reviewSelectionDiagnostic(current,letters);
      throw new Error('实际勾选与目标参考答案不一致，已停止');
    }
    return {letters:selected.map(x=>x.letter).join(''),selected:selected.map(({letter,content,state})=>({letter,content,proof:state.proof}))};
  };

  // Learning page: the course catalog is a separate, nested scroll surface.
  var LEARN_STATE='zhs_learn_navigation_v1';
  var learnRoute = (value=location.href) => {
    try {
      const url=new URL(value,location.href),m=url.pathname.match(/^\/learnPage\/([^/]+)\/([^/]+)\/([^/]+)\/?$/);
      return url.origin==='https://ai-smart-course-student-pro.zhihuishu.com'&&m?
        {course:m[1],point:m[2],cls:m[3],url:url.href,listUrl:`${url.origin}/singleCourse/knowledgeStudy/${m[1]}/${m[3]}`}:null;
    }catch(_){return null;}
  };
  var learnHeaders = root => [...root.querySelectorAll('.el-collapse-item__header,[id^="el-collapse-head-"]')]
    .filter(el=>reviewVisible(el)&&el.matches('[aria-expanded], [role="button"],button'));
  var learnCatalogRoot = () => {
    const headers=learnHeaders(document);
    if(!headers.length) return null;
    let root=headers[0].parentElement;
    while(root && !headers.every(el=>root.contains(el))) root=root.parentElement;
    // Never scan the page, PDF viewer, or chat box as if it were the catalog.
    return root && root!==document.body && root!==document.documentElement?root:null;
  };
  var learnTitle = () => {
    const root=learnCatalogRoot();
    const heading=reviewCanonical(reviewText([...document.querySelectorAll('h1,h2,.knowledge-title,.knowledge-name')]
      .find(el=>reviewVisible(el)&&!root?.contains(el)&&!el.closest('#zhs-panel-host'))));
    if(heading)return heading;
    if(!root)return '';
    const titles=new Set(learnItems(root).map(item=>item.title));
    const matches=[...new Set([...document.querySelectorAll('div,span,p')]
      .filter(el=>!root.contains(el)&&!el.contains(root)&&reviewVisible(el)&&!el.closest('#zhs-panel-host'))
      .map(el=>reviewCanonical(reviewText(el))).filter(text=>titles.has(text)))];
    return matches.length===1?matches[0]:'';
  };
  var learnMastery = () => {
    const root=learnCatalogRoot();
    const nodes=[...document.querySelectorAll('div,p,span,label,strong')].filter(el=>reviewVisible(el)&&!root?.contains(el)&&!el.closest('#zhs-panel-host'));
    const textOf=el=>reviewCanonical(reviewText(el)).replace(/％/g,'%');
    const candidates=nodes.map(textOf).filter(text=>text.length<250&&/知识点最高掌握度/.test(text));
    // The label and percentage can be siblings inside a section/footer, not a div.
    for(const node of nodes.filter(el=>/^知识点最高掌握度[：:]?$/.test(textOf(el)))) {
      for(let parent=node.parentElement,depth=0;parent&&depth<3;parent=parent.parentElement,depth++) {
        const text=textOf(parent);if(text.length>=250)break;candidates.push(text);
      }
    }
    const values=[...new Set(candidates.map(text=>text.match(/知识点最高掌握度[：:]?(\d+(?:\.\d+)?)%/)?.[1]).filter(x=>x!==undefined))];
    return values.length===1&&Number(values[0])<=100?Number(values[0]):null;
  };
  var learnItems = root => {
    const route=learnRoute(), rows=[];
    const add=(el,title,href='')=>{
      title=reviewCanonical(title);if(!title||!reviewVisible(el)||rows.some(row=>row.el===el))return;
      const linked=href?learnRoute(href):null;
      if(linked && (linked.course!==route?.course||linked.cls!==route?.cls)) return;
      const path=[];
      for(let node=el.parentElement;node&&root.contains(node);node=node.parentElement) {
        if(!node.matches('.el-collapse-item'))continue;
        const header=[...node.children].flatMap(x=>x.matches('.el-collapse-item__header,[id^="el-collapse-head-"]')?[x]:[...x.querySelectorAll('.el-collapse-item__header,[id^="el-collapse-head-"]')])
          .find(x=>x.closest('.el-collapse-item')===node);
        if(header)path.unshift(reviewCanonical(reviewText(header)));
      }
      rows.push({el,title,point:linked?.point||'',key:linked?`point:${linked.point}`:JSON.stringify([path,title])});
    };
    const badgeText=el=>reviewText(el).replace(/\s+/g,'');
    const isBadge=text=>/^(?:必学|选学)(?:\d*\/\d+)?$/.test(text);
    for(const link of root.querySelectorAll('a[href*="/learnPage/"]')) add(link,reviewText(link).replace(/(?:必学|选学)\s*(?:\d*\s*\/\s*\d+)?/g,'').replace(/\s*\d*\s*\/\s*\d+\s*$/,''),link.href);
    // Actual catalog items are groups: knowledge title + 必学 + /1.
    const badges=[...root.querySelectorAll('span,div,p,em,small')].filter(el=>reviewVisible(el)&&isBadge(badgeText(el)));
    for(const badge of badges) {
      if(rows.some(row=>row.el.contains(badge)))continue;
      for(let row=badge.parentElement;row&&row!==root;row=row.parentElement) {
        if(row.querySelector('.el-collapse-item__header,[id^="el-collapse-head-"]'))break;
        if(badges.filter(other=>row.contains(other)&&!badges.some(parent=>parent!==other&&row.contains(parent)&&parent.contains(other))).length>1)break;
        const clone=row.cloneNode(true);
        for(const fraction of clone.querySelectorAll('span,div,p,small')) {
          if(!/^\/\d+$/.test(badgeText(fraction)))continue;
          const preceding=fraction.previousSibling;
          if(preceding&&/^\d+$/.test((preceding.textContent||'').trim()))preceding.remove();
        }
        for(const node of [...clone.querySelectorAll('*')].reverse()) if(isBadge(badgeText(node))||/^\d*\/\d+$/.test(badgeText(node)))node.remove();
        const title=reviewText(clone).replace(/(?:必学|选学)/g,'').replace(/\s*\d*\s*\/\s*\d+\s*$/,'').trim();
        if(title&&title.length<160) {add(row,title,row.querySelector('a[href*="/learnPage/"]')?.href||'');break;}
      }
    }
    rows.sort((a,b)=>a.el.compareDocumentPosition(b.el)&4?-1:1);
    return rows.filter((row,i)=>!rows.some((other,j)=>j!==i&&other.el!==row.el&&row.el.contains(other.el)));
  };
  var learnScrollers = root => {
    const nodes=[root,...root.querySelectorAll('*')];
    for(let node=root.parentElement;node&&node!==document.body;node=node.parentElement)nodes.push(node);
    return [...new Set(nodes)].filter(node=>node.clientHeight>0&&node.scrollHeight>node.clientHeight+8&&/(auto|scroll)/.test(getComputedStyle(node).overflowY));
  };
  var learnScanCatalog = async (target=null) => {
    const origin=location.href,root=learnCatalogRoot(),collected=new Map(),expanded=new Set();
    if(!root)return {items:[],complete:false,reason:'未定位到左侧课程目录'};
    const valid=()=>!unsafeWindow.__ZHS_STOP&&location.href===origin&&root.isConnected;
    const collect=()=>{for(const row of learnItems(root))collected.set(row.key,row);};
    const found=()=>target?learnItems(root).find(row=>row.key===target&&row.el.isConnected&&reviewVisible(row.el)):null;
    const headerKey=el=>`${el.getAttribute('aria-controls')||el.id}|${reviewText(el)}`;
    const expand=async()=>{
      for(let n=0;n<120&&valid();n++) {
        collect();if(found())return true;
        const header=learnHeaders(root).find(el=>el.getAttribute('aria-expanded')==='false'&&!expanded.has(headerKey(el)));
        if(!header)return true;
        expanded.add(headerKey(header));setLoopKey(true);click(header);await sleep(250);
        if(header.isConnected&&header.getAttribute('aria-expanded')==='false')return false;
        collect();
      }
      return false;
    };
    for(const scroller of learnScrollers(root)) {scroller.scrollTop=0;scroller.dispatchEvent(new Event('scroll'));}
    await sleep(250);
    if(!await expand()||!valid())return {items:[...collected.values()],complete:false};
    collect();if(found())return {items:[...collected.values()],target:found(),complete:true};
    // An ancestor scroller holds the entire left catalog, not the document body.
    for(const scroller of learnScrollers(root)) {
      scroller.scrollTop=0;scroller.dispatchEvent(new Event('scroll'));await sleep(250);
      let bottomStable=0,lastCount=-1,finished=false;
      for(let n=0;n<160&&valid();n++) {
        if(!await expand())break;collect();
        if(found())return {items:[...collected.values()],target:found(),complete:true};
        const bottom=Math.max(0,scroller.scrollHeight-scroller.clientHeight);
        const atBottom=scroller.scrollTop>=bottom-2;
        bottomStable=atBottom&&collected.size===lastCount?bottomStable+1:0;lastCount=collected.size;
        if(bottomStable>=2){finished=true;break;}
        scroller.scrollTop=Math.min(bottom,scroller.scrollTop+Math.max(120,scroller.clientHeight*.7));
        scroller.dispatchEvent(new Event('scroll'));setLoopKey(true);await sleep(250);
      }
      if(!finished)return {items:[...collected.values()],complete:false};
    }
    collect();
    const result={items:[...collected.values()],target:found(),complete:valid()};
    GM_setValue('zhs_catalog_scan_v1',{time:new Date().toISOString(),path:location.pathname,complete:result.complete,
      items:result.items.map(({el,...item})=>item)});
    return result;
  };
  var learnSeed = () => {
    const route=learnRoute();if(!route)return;
    const previous=GM_getValue(LEARN_STATE,null);
    if(previous?.url===route.url){GM_setValue(LEARN_STATE,{...previous,title:reviewCanonical(reviewDecodeTitle(previous.title))});return;}
    GM_setValue(LEARN_STATE,{...route,title:learnTitle(),phase:'ready',attempts:{},completed:[]});
  };
  var learnReturnUrl = () => {
    const saved=GM_getValue(LEARN_STATE,null);if(!saved?.url)return '';
    const info=reviewPracticeInfo(),route=learnRoute(saved.url);
    return route&&route.listUrl===info.listUrl&&route.point===info.point?saved.url:'';
  };
  var learnReturn = async () => {
    const url=learnReturnUrl();if(!url)return false;
    setLoopKey(true);reviewNavigate(url);
    return !!await reviewWait(()=>location.href===url,12000);
  };
  var learnRecordMastery = (pct,info=reviewPracticeInfo()) => {
    const state=GM_getValue(LEARN_STATE,null);
    if(!state||state.listUrl!==info.listUrl||state.point!==info.point||!Number.isFinite(pct)||pct<0||pct>100)return;
    const previous=state.mastery?.[info.point];
    GM_setValue(LEARN_STATE,{...state,mastery:{...(state.mastery||{}),[info.point]:{
      pct:Math.max(previous?.pct||0,pct),title:info.title||state.title,at:new Date().toISOString()}}});
  };
  var learnKnownMastery = () => {
    const info=reviewPracticeInfo(),state=GM_getValue(LEARN_STATE,null);
    return state?.listUrl===info.listUrl&&state.point===info.point?state.mastery?.[info.point]?.pct??null:null;
  };
  var learnReadPublishedMastery = () => {
    if(!reviewIsHistory()&&!document.querySelector('.charts-rate'))return null;
    const values=[];
    for(const el of document.querySelectorAll('div,p,span,strong')) {
      if(!reviewVisible(el)||el.closest('#zhs-panel-host'))continue;
      const text=reviewCanonical(reviewText(el)).replace(/％/g,'%');if(text.length>180)continue;
      for(const match of text.matchAll(/(?:知识点)?(?:最高)?掌握度[：:]?(\d+(?:\.\d+)?)%/g))if(Number(match[1])<=100)values.push(Number(match[1]));
    }
    return values.length?Math.max(...values):null;
  };
  var learnClearPending = () => {
    GM_setValue(REVIEW_PENDING,false);GM_setValue(REVIEW_HISTORY_OPEN,'');GM_setValue(REVIEW_RETURN,'');
  };
  var learnImproveEntry = () => {
    const root=learnCatalogRoot(),targets=new Set();
    const clean=value=>reviewCanonical(value).replace(/[\ue000-\uf8ff]/g,'').replace(/[\u2190-\u21ff\u2794-\u27bf›»>]+$/g,'');
    for(const node of document.querySelectorAll('button,a,[role="button"],.improve-btn,.simplified-mastery__action,div,span')) {
      if(!reviewVisible(node)||root?.contains(node)||node.closest('#zhs-panel-host'))continue;
      // Ignore icon glyphs and SVG accessibility descriptions when reading the label.
      const raw=reviewText(node);if(raw.length>120&&!node.matches('button,a,[role="button"]'))continue;
      const clone=node.cloneNode(true);
      clone.querySelectorAll('svg,.el-icon,.iconfont,[aria-hidden="true"],script,style').forEach(el=>el.remove());
      const labels=[node.getAttribute('aria-label'),node.getAttribute('title'),reviewText(clone),raw];
      if(!labels.some(label=>clean(label)==='去提升'))continue;
      const target=node.closest('button,a,[role="button"],.improve-btn,.simplified-mastery__action')||node;
      if(reviewVisible(target)&&!root?.contains(target))targets.add(target);
    }
    const options=[...targets].filter(node=>![...targets].some(other=>other!==node&&node.contains(other)));
    const disabled=options.some(node=>node.closest('[disabled],[aria-disabled="true"],.is-disabled'));
    return {button:!disabled&&options.length===1?options[0]:null,disabled,count:options.length,
      samples:options.slice(0,5).map(node=>({tag:node.tagName,text:reviewText(node).slice(0,100)}))};
  };
  var learnHistoryUrl = route => {
    const checked=learnRoute(route?.url);if(!checked)return '';
    const url=new URL(checked.url);url.pathname=`/masteryHistory/${encodeURIComponent(checked.course)}/${encodeURIComponent(checked.cls)}/${encodeURIComponent(checked.point)}`;
    url.hash='';return url.href;
  };
  var learnEnterPractice = async (route,state,pending) => {
    let entry=learnImproveEntry();
    if(!entry.button&&!entry.disabled)await reviewWait(()=>{entry=learnImproveEntry();return entry.button||entry.disabled;},2500);
    if(unsafeWindow.__ZHS_STOP||location.href!==route.url)return false;
    if(entry.disabled){panelNotify('error','去提升入口当前不可用，已保留当前位置');return false;}
    const next={...state,phase:'practice',attempts:{...(state.attempts||{}),[route.point]:(state.attempts?.[route.point]||0)+(pending?0:1)}};
    GM_setValue(LEARN_STATE,next);
    const record={time:new Date().toISOString(),point:route.point,path:location.pathname,
      entry:{count:entry.count,samples:entry.samples},method:entry.button?'button':'history-route'};
    GM_setValue('zhs_learn_entry_v1',record);
    if(entry.button) {
      click(entry.button);
      if(await reviewWait(()=>location.href!==route.url,5000))return true;
    }
    if(unsafeWindow.__ZHS_STOP||location.href!==route.url)return false;
    if(learnImproveEntry().disabled)return false;
    const destination=learnHistoryUrl(route);if(!destination)return false;
    GM_setValue('zhs_learn_entry_v1',{...record,method:entry.button?'button-then-history-route':'history-route',destination});
    panelNotify('memory','正在打开当前知识点的练习历史页');
    setLoopKey(true);reviewNavigate(destination);
    return !!await reviewWait(()=>location.href===destination,12000);
  };
  var learnRun = async () => {
    const route=learnRoute();if(!route||unsafeWindow.__ZHS_STOP)return false;
    let state=GM_getValue(LEARN_STATE,null);
    if(!state||state.listUrl!==route.listUrl) {learnSeed();state=GM_getValue(LEARN_STATE,null);}
    state.title=reviewCanonical(reviewDecodeTitle(state.title));
    const expectedTitle=state.point===route.point?state.title:'';
    const ready=await reviewWait(()=>learnTitle()&&(!expectedTitle||learnTitle()===expectedTitle)&&learnMastery()!==null,12000);
    if(!ready){
      if(unsafeWindow.__ZHS_STOP)return false;
      const actual=learnTitle(),pct=learnMastery();
      panelNotify('error',`学习页读取失败：标题=${actual||'未识别'}；掌握度=${pct===null?'未识别':pct+'%'}；预期=${expectedTitle||'无'}，请导出页面结构`);return false;
    }
    const title=learnTitle(),shownPct=learnMastery();
    state={...state,...route,title};GM_setValue(LEARN_STATE,state);
    learnRecordMastery(shownPct,{listUrl:route.listUrl,point:route.point,title});
    state=GM_getValue(LEARN_STATE,state);
    const pct=Math.max(shownPct,state.mastery?.[route.point]?.pct||0),achieved=pct>=getThreshold();
    const skipped=Object.values(GM_getValue(REVIEW_SKIP_STORE,{})).some(x=>x.listUrl===route.listUrl&&(x.point===route.point||x.title===title));
    const pending=GM_getValue(REVIEW_PENDING,false),attempts=state.attempts?.[route.point]||0;
    if(!achieved&&!skipped&&(pending||attempts<MAX_RETRIES)) {
      panelNotify('memory',`${title}：掌握度 ${pct}%，${pending?'先读取本次练习解析':'进入练习'}`);
      return learnEnterPractice(route,state,pending);
    }
    // A mastered point must never re-enter practice because an old review flag remains.
    learnClearPending();state.phase='advance';GM_setValue(LEARN_STATE,state);
    panelNotify('memory',`${title}：${skipped?'已标记填空跳过':pct>=getThreshold()?`掌握度 ${pct}% 已达标`:'已达尝试上限'}，展开并滚动目录查找下一节`);
    const scan=await learnScanCatalog();
    if(!scan.complete){panelNotify('error','目录扫描尚未完成，已保留当前位置');return false;}
    let matches=scan.items.map((item,i)=>item.point===route.point?i:-1).filter(i=>i>=0);
    if(!matches.length)matches=scan.items.map((item,i)=>item.title===title?i:-1).filter(i=>i>=0);
    if(matches.length!==1){panelNotify('error','未能在展开后的目录中唯一定位当前知识点，请导出页面结构');return false;}
    const current=scan.items[matches[0]];
    state.completed=[...new Set([...(state.completed||[]),current.key])];
    const next=scan.items.slice(matches[0]+1).find(item=>!state.completed.includes(item.key));
    GM_setValue(LEARN_STATE,state);
    if(!next){setLoopKey(false);panelNotify('memory','已扫描到目录底部，起点之后的知识点处理完毕');return true;}
    // Re-find after the sweep: a virtualized catalog may have recycled the row.
    const located=await learnScanCatalog(next.key),target=located.target;
    if(!target||unsafeWindow.__ZHS_STOP){panelNotify('error','下一节目录项尚未定位，保留当前位置');return false;}
    target.el.scrollIntoView?.({block:'nearest'});
    panelNotify('memory',`按目录顺序进入：${target.title}`);
    click(target.el);
    const moved=await reviewWait(()=>learnRoute()?.point!==route.point&&!!learnRoute());
    if(!moved){panelNotify('error','点击目录后未确认知识点切换，已停止');return false;}
    const fresh=learnRoute();GM_setValue(LEARN_STATE,{...state,...fresh,title:target.title,phase:'ready'});
    return true;
  };

  // src/panel.js
  var hopActionLabel = (screen, expectDetailForward) => {
    switch (screen) {
      case SCREENS.HISTORY:
        return "处理历史记录";
      case SCREENS.REVIEW:
        return "读取整页解析";
      case SCREENS.LIST:
        return "选中低分题";
      case SCREENS.DETAIL:
        return expectDetailForward ? "去提升" : "退回列表";
      case SCREENS.PRE_QUIZ:
        return "开始提升";
      case SCREENS.QUIZ:
        return "答题/切题";
      case SCREENS.RESULT:
        return "退出成绩页";
      default:
        return "未知操作";
    }
  };
  var panelCtx = null;
  var panelNotify = (event, detail) => {
    if (panelCtx) panelCtx.handle(event, detail);
  };
  var createPanel = (handlers) => {
    const host = document.createElement("div");
    host.id = "zhs-panel-host";
    host.style.cssText = "all:initial;position:fixed;z-index:2147483646;";
    document.body.appendChild(host);
    const shadow = host.attachShadow({ mode: "closed" });
    shadow.innerHTML = `
    <style>
      *{box-sizing:border-box;margin:0;padding:0;font-family:"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
      .wrap{position:fixed;top:0;right:0;width:28vw;height:100vh;color:#355148;font-size:12px;overflow:hidden;user-select:none;border-left:1px solid rgba(102,152,129,.16);background:linear-gradient(180deg,#f9fcf9 0%,#f3f8f3 56%,#edf4ee 100%);box-shadow:-12px 0 32px rgba(62,86,66,.06)}
      .wrap::before,.wrap::after{content:"";position:absolute;pointer-events:none}
      .wrap::before{top:-5vh;right:-4vw;width:12vw;height:14vw;background:radial-gradient(circle,rgba(164,212,179,.18),rgba(164,212,179,0));filter:blur(8px)}
      .wrap::after{bottom:-4vh;left:-3vw;width:10vw;height:10vw;background:radial-gradient(circle,rgba(215,234,220,.36),rgba(215,234,220,0));filter:blur(10px)}
      .wrap.collapsed{width:auto;height:auto;background:transparent;border:none;box-shadow:none}
      .wrap.collapsed::before,.wrap.collapsed::after{display:none}
      .wrap.error{color:#6b2525;border-left:1px solid rgba(180,110,110,.25);background:linear-gradient(180deg,#fff5f5 0%,#ffebeb 56%,#ffd6d6 100%);box-shadow:-12px 0 32px rgba(110,60,60,.1)}
      .wrap.error::before{background:radial-gradient(circle,rgba(239,154,154,.28),rgba(239,154,154,0))}
      .wrap.error::after{background:radial-gradient(circle,rgba(255,138,128,.38),rgba(255,138,128,0))}
      .wrap.error .header{background:linear-gradient(180deg,#ffe3e3 0%,#ffd6d6 100%);border-bottom:1px solid rgba(180,121,121,.22)}
      .wrap.error .title{color:#6b2525}
      .wrap.error .subtitle{color:#a35c5c}
      .wrap.error .section-label{color:#a85353}
      .wrap.error .section-label::after{background:linear-gradient(90deg,rgba(180,120,120,.26),rgba(180,120,120,0))}
      .wrap.error .fab{background:linear-gradient(180deg,#ffd6d6,#fca3a3);border:1px solid rgba(180,125,125,.4);color:#6b2525;box-shadow:0 14px 32px rgba(118,87,87,.15)}
      .fab{display:none;width:58px;height:58px;border-radius:18px;background:linear-gradient(180deg,#dcefe0,#cfe8d5);border:1px solid rgba(125,164,138,.3);color:#456556;font-weight:800;font-size:12px;letter-spacing:.12em;cursor:pointer;align-items:center;justify-content:center;box-shadow:0 14px 32px rgba(87,118,96,.15)}
      .wrap.collapsed .fab{display:flex}
      .wrap.collapsed .panel-shell{display:none}
      .panel-shell{display:flex;flex-direction:column;height:100%}
      .header{display:flex;align-items:center;gap:10px;padding:20px 18px 16px;background:linear-gradient(180deg,#e4f2e7 0%,#dceee1 100%);border-bottom:1px solid rgba(121,159,135,.16)}
      .dot{width:10px;height:10px;border-radius:999px;background:#8ea69b;flex-shrink:0;box-shadow:0 0 0 5px rgba(255,255,255,.42)}
      .dot.running{background:#67b67a;box-shadow:0 0 0 5px rgba(255,255,255,.52),0 0 18px rgba(103,182,122,.34);animation:zhs-pulse 1.4s ease infinite}
      @keyframes zhs-pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(.92);opacity:.72}}
      .title-wrap{display:flex;flex-direction:column;gap:2px;flex:1;min-width:0}
      .title{font-family:"Georgia","Times New Roman",serif;font-weight:700;font-size:20px;letter-spacing:.02em;color:#2d4a3d}
      .subtitle{font-size:10px;color:#6e8d7a;letter-spacing:.16em;text-transform:uppercase}
      .icon-btn{border:none;color:#5f7d6b;cursor:pointer;width:34px;height:34px;border-radius:12px;font-size:14px;line-height:1;background:rgba(255,255,255,.54);border:1px solid rgba(121,159,135,.16);transition:.18s ease;box-shadow:inset 0 1px 0 rgba(255,255,255,.6)}
      .icon-btn:hover{color:#264437;background:#eef8f0;border-color:rgba(121,159,135,.3);transform:translateY(-1px)}
      .panel-body{position:relative;display:flex;flex-direction:column;gap:0;flex:1;min-height:0;padding:16px 16px 18px;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain}
      .panel-body::-webkit-scrollbar{width:10px}
      .panel-body::-webkit-scrollbar-thumb{background:rgba(125,164,138,.28);border-radius:999px;border:2px solid transparent;background-clip:padding-box}
      .panel-body::-webkit-scrollbar-track{background:transparent}
      .section-label{display:flex;align-items:center;justify-content:space-between;margin:0 0 8px 0;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#7a9888}
      .section-label::after{content:"";flex:1;height:1px;margin-left:10px;background:linear-gradient(90deg,rgba(120,159,136,.26),rgba(120,159,136,0))}
      .settings{display:none;background:linear-gradient(180deg,rgba(255,255,255,.86),rgba(249,252,249,.9));border:1px solid rgba(131,170,146,.16);border-radius:20px;padding:14px;margin-bottom:12px;box-shadow:0 8px 22px rgba(83,112,89,.045),inset 0 1px 0 rgba(255,255,255,.8)}
      .settings.open{display:block}
      .settings-hint{margin:-2px 0 10px 0;color:#789383;font-size:11px;line-height:1.5}
      .vision-tip{margin-bottom:10px;padding:10px 12px;border-radius:14px;background:linear-gradient(180deg,#f2f9f3,#ebf5ee);border:1px solid rgba(119,171,134,.16);color:#4f6d5b;font-size:10px;line-height:1.6}
      .form-grid{display:grid;gap:8px}
      .form-group{display:flex;flex-direction:column;gap:5px}
      .form-group label{color:#789686;font-size:10px;letter-spacing:.08em;text-transform:uppercase}
      .form-group input{background:rgba(255,255,255,.84);border:1px solid rgba(131,170,146,.18);color:#365044;border-radius:14px;padding:11px 12px;font-size:11px;outline:none;width:100%;transition:.18s ease;box-shadow:inset 0 1px 0 rgba(255,255,255,.8)}
      .form-group input::placeholder{color:#9ab0a1}
      .form-group input:focus{border-color:rgba(116,173,133,.45);background:#ffffff;box-shadow:0 0 0 4px rgba(164,212,179,.18)}
      .steps{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px;margin-bottom:12px}
      .step{text-align:center;padding:9px 4px;border-radius:14px;font-size:10px;color:#88a093;background:rgba(255,255,255,.54);border:1px solid rgba(125,164,138,.12);letter-spacing:.04em;box-shadow:inset 0 1px 0 rgba(255,255,255,.6)}
      .step.done{color:#5c7a69;background:rgba(221,239,226,.92)}
      .step.active{color:#295040;border-color:rgba(111,165,127,.22);background:linear-gradient(180deg,#dff1e3,#d5ebdb);box-shadow:0 6px 16px rgba(102,152,129,.1)}
      .meta{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px}
      .tag{padding:7px 11px;border-radius:999px;background:rgba(255,255,255,.62);border:1px solid rgba(125,164,138,.12);color:#768d80;font-size:10px;letter-spacing:.03em}
      .tag.on{color:#2f6a45;border-color:rgba(103,182,122,.18);background:#e4f4e8}
      .tag.off{color:#8fa497}
      .btns{display:flex;gap:8px;margin-bottom:12px}
      .btn{flex:1;padding:11px 0;border:none;border-radius:16px;font-size:12px;font-weight:800;letter-spacing:.02em;cursor:pointer;transition:.18s ease}
      .btn:hover{transform:translateY(-1px)}
      .btn-start{background:linear-gradient(180deg,#95caa4,#7fbb93);color:#ffffff;box-shadow:0 8px 18px rgba(116,181,138,.18)}
      .btn-start:hover{filter:brightness(1.02)}
      .btn-stop{background:rgba(255,255,255,.66);color:#90706e;border:1px solid rgba(180,141,141,.16)}
      .btn-stop:hover{background:#fff7f7}
      .log-wrap{display:flex;flex-direction:column;min-height:220px;flex:1}
      .log{flex:1;min-height:180px;max-height:34vh;overflow-y:auto;background:linear-gradient(180deg,rgba(255,255,255,.88),rgba(247,250,247,.96));border-radius:18px;padding:10px;border:1px solid rgba(125,164,138,.1);font-size:10px;line-height:1.6;color:#5b7568;word-wrap:break-word;word-break:break-all;box-shadow:inset 0 1px 0 rgba(255,255,255,.78)}
      .log-item{display:flex;gap:6px;margin-bottom:4px;padding:6px 7px;border-radius:11px;background:rgba(233,242,235,.65)}
      .log-item.err{color:#a45d5d;background:rgba(255,235,235,.88)}
      .log-time{color:#90a497;min-width:52px;flex-shrink:0}
      .log-empty{color:#97aa9e;text-align:center;padding:8px 0}
    </style>
    <div class="wrap" id="wrap">
      <button class="fab" id="fab" type="button" title="展开面板">ZHS</button>
      <div class="panel-shell">
        <div class="header" id="drag-handle">
          <span class="dot" id="run-dot"></span>
          <div class="title-wrap">
            <span class="title">掌握度链路</span>
            <span class="subtitle">Vision AI Control Panel</span>
          </div>
          <button class="icon-btn" id="btn-settings" type="button" title="设置">⚙</button>
          <button class="icon-btn" id="btn-collapse" type="button" title="折叠">−</button>
        </div>
        <div class="panel-body">
          <div class="settings open" id="settings-panel">
            <div class="section-label">AI 配置</div>
            <div class="settings-hint">首次使用请先填入接口地址、密钥和模型名。</div>
            <div class="vision-tip">建议优先使用带视觉能力的模型。已默认关闭思考模式；若控制台仍出现 reasoning_content，请换非思考模型。</div>
            <div class="form-grid">
              <div class="form-group"><label>API Base URL</label><input id="inp-baseurl" type="text" placeholder="https://api.deepseek.com"></div>
              <div class="form-group"><label>API Key</label><input id="inp-apikey" type="password" placeholder="输入你的 API Key"></div>
              <div class="form-group"><label>Model Name</label><input id="inp-model" type="text" placeholder="推荐：deepseek-chat / qwen-vl-plus"></div>
              <div class="form-group"><label>Max Tokens</label><input id="inp-maxtokens" type="number" min="256" max="8192" placeholder="默认 2048"></div>
              <div class="form-group"><label>Timeout (ms)</label><input id="inp-timeout" type="number" min="10000" max="300000" step="10000" placeholder="默认 120000"></div>
              <div class="form-group"><label>掌握度阈值 (%)</label><input id="inp-threshold" type="number" min="0" max="100" placeholder="默认 80"></div>
              <div class="form-group">
                <label>题目获取引擎</label>
                <div style="display:flex;gap:12px;margin: 4px 0 4px 0;">
                  <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:#355148;font-weight:500;">
                    <input type="radio" name="engine-mode" value="traditional" checked style="accent-color:#7fbb93;"> 传统文本+图片
                  </label>
                  <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:#355148;font-weight:500;">
                    <input type="radio" name="engine-mode" value="screenshot" style="accent-color:#7fbb93;"> 截图引擎 (html2canvas)
                  </label>
                </div>
              </div>
            </div>
            <div class="btns" style="margin:6px 0 0 0">
              <button class="btn btn-start" id="btn-save-settings" type="button">保存配置</button>
            </div>
            <div class="btns" style="margin:6px 0 0 0">
              <button class="btn btn-stop" id="btn-reset-retry" type="button">重置做题次数</button>
            </div>
          </div>
          <div class="section-label">运行模式</div>
          <div style="display:flex;gap:12px;margin: 4px 0 12px 0;">
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:#355148;font-weight:500;">
              <input type="radio" name="run-mode" value="chain" checked style="accent-color:#7fbb93;"> 掌握度自适应
            </label>
            <label style="display:flex;align-items:center;gap:4px;cursor:pointer;color:#355148;font-weight:500;">
              <input type="radio" name="run-mode" value="homework" style="accent-color:#7fbb93;"> 课后作业/测试
            </label>
          </div>
          <div class="section-label">运行状态</div>
          <div class="steps" id="steps">${CHAIN_STEPS.map((s) => `<div class="step" data-id="${s.id}">${s.label}</div>`).join("")}</div>
          <div class="meta">
            <span class="tag" id="tag-run">已停止</span>
            <span class="tag" id="tag-loop">循环关</span>
            <span class="tag" id="tag-screen">当前：—</span>
            <span class="tag" id="tag-api" title="当前 API 配置">API：—</span>
            <span class="tag" id="tag-memory">参考答案 0 | AI 0</span>
          </div>
          <div class="btns">
            <button class="btn btn-start" id="btn-start" type="button">开始/继续</button>
            <button class="btn btn-stop" id="btn-stop" type="button">停止</button>
          </div>
          <div class="log-wrap">
            <div class="section-label">运行日志</div>
            <div class="log" id="log"></div>
          </div>
        </div>
      </div>
    </div>
  `;
    const wrap = shadow.getElementById("wrap");
    const fab = shadow.getElementById("fab");
    const dragHandle = shadow.getElementById("drag-handle");
    const stepsEl = shadow.getElementById("steps");
    const runDot = shadow.getElementById("run-dot");
    const tagRun = shadow.getElementById("tag-run");
    const tagLoop = shadow.getElementById("tag-loop");
    const tagScreen = shadow.getElementById("tag-screen");
    const tagApi = shadow.getElementById("tag-api");
    const logEl = shadow.getElementById("log");
    const btnStart = shadow.getElementById("btn-start");
    const btnStop = shadow.getElementById("btn-stop");
    const btnCollapse = shadow.getElementById("btn-collapse");
    const btnSettings = shadow.getElementById("btn-settings");
    const settingsPanel = shadow.getElementById("settings-panel");
    const inpBaseUrl = shadow.getElementById("inp-baseurl");
    const inpApiKey = shadow.getElementById("inp-apikey");
    const inpModel = shadow.getElementById("inp-model");
    const inpMaxTokens = shadow.getElementById("inp-maxtokens");
    const inpTimeout = shadow.getElementById("inp-timeout");
    const inpThreshold = shadow.getElementById("inp-threshold");
    const btnSaveSettings = shadow.getElementById("btn-save-settings");
    const btnResetRetry = shadow.getElementById("btn-reset-retry");
    const logs = [];
    let running = false;
    let currentScreen = SCREENS.UNKNOWN;
    const fmtTime = () => {
      const d = /* @__PURE__ */ new Date();
      return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
    };
    const renderLogs = () => {
      logEl.innerHTML = logs.length ? logs.map(
        (l) => `<div class="log-item${l.err ? " err" : ""}"><span class="log-time">${l.t}</span><span>${String(l.m).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")}</span></div>`
      ).join("") : '<div class="log-empty">等待任务开始…</div>';
      logEl.scrollTop = logEl.scrollHeight;
    };
    const addLog = (msg, err = false) => {
      logs.push({ t: fmtTime(), m: msg, err });
      if (logs.length > 30) logs.shift();
      renderLogs();
    };
    const applyPos = (offsetX = 0) => {
      wrap.style.right = `${offsetX}px`;
      wrap.style.top = "0";
      wrap.style.left = "auto";
      wrap.style.bottom = "auto";
      if (wrap.classList.contains("collapsed")) {
        wrap.style.height = "";
        wrap.style.width = "";
      } else {
        wrap.style.height = "100vh";
        wrap.style.width = "28vw";
      }
    };
    const savePos = (offsetX) => {
      GM_setValue(PANEL_POS_KEY, { x: Math.round(offsetX) });
    };
    const setCollapsed = (collapsed) => {
      wrap.classList.toggle("collapsed", collapsed);
      const savedPos = GM_getValue(PANEL_POS_KEY, { x: 0 });
      applyPos(typeof savedPos?.x === "number" ? savedPos.x : 0);
      GM_setValue(PANEL_COLLAPSED_KEY, collapsed);
    };
    const updateSteps = (screen) => {
      const idx = CHAIN_STEPS.findIndex((s) => s.id === screen);
      stepsEl.querySelectorAll(".step").forEach((el, i) => {
        el.classList.remove("active", "done");
        if (idx < 0) return;
        if (i < idx) el.classList.add("done");
        else if (i === idx) el.classList.add("active");
      });
    };
    const loadSettingsInputs = () => {
      inpBaseUrl.value = GM_getValue("zhs_api_baseurl", "");
      inpApiKey.value = GM_getValue("zhs_api_apikey", "");
      inpModel.value = GM_getValue("zhs_api_model", "");
      inpMaxTokens.value = GM_getValue("zhs_api_maxtokens", 2048);
      inpTimeout.value = GM_getValue("zhs_api_timeout", 12e4);
      inpThreshold.value = GM_getValue(THRESHOLD_KEY, 90);
      const savedMode = GM_getValue("zhs_run_mode", "chain");
      const radio = shadow.querySelector(`input[name="run-mode"][value="${savedMode}"]`);
      if (radio) radio.checked = true;
      const savedEngine = GM_getValue("zhs_engine_mode", "traditional");
      const engineRadio = shadow.querySelector(`input[name="engine-mode"][value="${savedEngine}"]`);
      if (engineRadio) engineRadio.checked = true;
    };
    const refreshApiStatus = () => {
      const cfg = getApiCfg();
      const modelLabel = cfg.model ? cfg.model.split("-")[0] : "未配置";
      const baseUrlShort = cfg.baseUrl ? cfg.baseUrl.replace(/^https?:\/\//, "").replace(/\/$/, "") : "未配置";
      const keyLabel = cfg.apiKey ? "已配置" : "未配置";
      tagApi.textContent = `API:${modelLabel}`;
      tagApi.title = `BaseURL: ${baseUrlShort}
Key: ${keyLabel}`;
    };
    const refreshStatus = () => {
      const loop = isLoopOn();
      const memoryStats=reviewGetStats();
      shadow.getElementById('tag-memory').textContent=`参考答案 ${memoryStats.hits} | AI ${memoryStats.ai} | 拦截 ${memoryStats.blocked}`;
      running = !!unsafeWindow.__ZHS_CHAIN_RUNNING;
      runDot.classList.toggle("running", running);
      tagRun.textContent = running ? "运行中" : "已停止";
      tagRun.className = `tag ${running ? "on" : "off"}`;
      tagLoop.textContent = loop ? "循环开" : "循环关";
      tagLoop.className = `tag ${loop ? "on" : "off"}`;
      tagScreen.textContent = `当前：${SCREEN_LABELS[currentScreen] || currentScreen}`;
      refreshApiStatus();
      updateSteps(currentScreen);
    };
    const handle = (event, detail) => {
      switch (event) {
        case "init":
          wrap.classList.remove("error");
          addLog("待命，点击「开始/继续」启动");
          refreshStatus();
          break;
        case "start":
          wrap.classList.remove("error");
          addLog("已开始");
          refreshStatus();
          break;
        case "stop":
          wrap.classList.remove("error");
          addLog("已停止");
          refreshStatus();
          break;
        case "screen":
          if (detail) currentScreen = detail;
          refreshStatus();
          break;
        case "hop":
          if (detail?.action) addLog(`${SCREEN_LABELS[detail.screen] || detail.screen} → ${detail.action}`);
          else if (detail?.screen)
            addLog(`${SCREEN_LABELS[detail.screen] || detail.screen} → ${hopActionLabel(detail.screen, detail.expectDetailForward)}`);
          refreshStatus();
          break;
        case "memory":
          addLog(detail || "解析记忆");
          refreshStatus();
          break;
        case "quiz":
          if (detail?.phase === "start") addLog("正在匹配题目、确定答案…");
          else if (detail?.phase === "done") addLog(`本题已核对勾选 | ${detail.aiOutput || ""}`);
          break;
        case "error":
          wrap.classList.add("error");
          addLog(detail || "发生错误", true);
          refreshStatus();
          break;
        case "done":
          addLog("本轮结束");
          refreshStatus();
          break;
        default:
          break;
      }
    };
    const setupDrag = (handleEl, onTap) => {
      handleEl.addEventListener("mousedown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const startX = e.clientX;
        const saved = GM_getValue(PANEL_POS_KEY, { x: 0 });
        const startOffsetX = typeof saved?.x === "number" ? saved.x : 0;
        let moved = false;
        const onMove = (ev) => {
          const deltaX = startX - ev.clientX;
          if (Math.abs(deltaX) > 3) moved = true;
          const maxOffset = Math.max(window.innerWidth - 72, 0);
          const nextOffset = Math.min(Math.max(startOffsetX + deltaX, 0), maxOffset);
          applyPos(nextOffset);
        };
        const onUp = (ev) => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          const deltaX = startX - ev.clientX;
          const maxOffset = Math.max(window.innerWidth - 72, 0);
          const nextOffset = Math.min(Math.max(startOffsetX + deltaX, 0), maxOffset);
          savePos(nextOffset);
          if (!moved && onTap) onTap();
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });
    };
    setCollapsed(GM_getValue(PANEL_COLLAPSED_KEY, false));
    setupDrag(dragHandle);
    setupDrag(fab, () => setCollapsed(false));
    loadSettingsInputs();
    shadow.querySelectorAll('input[name="run-mode"]').forEach((input) => {
      input.addEventListener("change", (e) => {
        GM_setValue("zhs_run_mode", e.target.value);
        addLog(`已切换运行模式：${e.target.value === "chain" ? "掌握度自适应" : "课后作业/测试"}`);
      });
    });
    shadow.querySelectorAll('input[name="engine-mode"]').forEach((input) => {
      input.addEventListener("change", (e) => {
        GM_setValue("zhs_engine_mode", e.target.value);
        addLog(`已切换题目获取引擎：${e.target.value === "screenshot" ? "截图引擎" : "传统文本+图片"}`);
      });
    });
    btnStart.addEventListener("click", () => handlers.onStart());
    btnStop.addEventListener("click", () => handlers.onStop());
    btnCollapse.addEventListener("click", () => setCollapsed(true));
    btnSettings.addEventListener("click", () => {
      const isOpen = settingsPanel.classList.toggle("open");
      if (isOpen) loadSettingsInputs();
    });
    btnSaveSettings.addEventListener("click", () => {
      GM_setValue("zhs_api_baseurl", inpBaseUrl.value.trim());
      GM_setValue("zhs_api_apikey", inpApiKey.value.trim());
      GM_setValue("zhs_api_model", inpModel.value.trim());
      saveMaxTokens(inpMaxTokens.value);
      saveTimeout(inpTimeout.value);
      const threshold = parseInt(inpThreshold.value, 10);
      if (!Number.isNaN(threshold) && threshold >= 0 && threshold <= 100) {
        GM_setValue(THRESHOLD_KEY, threshold);
      }
      const selectedEngine = shadow.querySelector('input[name="engine-mode"]:checked')?.value || "traditional";
      GM_setValue("zhs_engine_mode", selectedEngine);
      settingsPanel.classList.remove("open");
      addLog("API 配置已保存");
      refreshApiStatus();
    });
    btnResetRetry.addEventListener("click", () => {
      resetRetryCounts();
      addLog("做题次数已重置");
    });
    panelCtx = { handle, refreshStatus, setScreen: (s) => {
      currentScreen = s;
      refreshStatus();
    } };
    return panelCtx;
  };

  // src/api.js
  var createAIChatState = () => ({
    status: AI_STATUS.IDLE,
    attempt: 0,
    lastRaw: "",
    lastError: null
  });

  // 从模型输出中提取答案字母：优先匹配 "答案：X"，否则提取全部字母
  var extractAnswerLetters = (raw) => {
    const text = raw || "";
    const m = text.match(/答案[：:]\s*([A-Za-z]+)/);
    const letters = m ? m[1] : text.replace(/[^A-Za-z]/g, "");
    return [...letters.toUpperCase()];
  };
  var isValidQuizAnswer = (raw, optionCount) => {
    const letters = extractAnswerLetters(raw);
    if (!letters.length) return false;
    return letters.every((l) => {
      const idx = l.charCodeAt(0) - 65;
      return idx >= 0 && idx < optionCount;
    });
  };
  var parseApiError = (res) => {
    let msg = "";
    try {
      const body = JSON.parse(res.responseText);
      msg = body?.error?.message || body?.error?.msg || body?.message || body?.msg || body?.error || "";
      if (typeof msg === "object") msg = JSON.stringify(msg);
    } catch (_) {
      msg = res.responseText || "";
    }
    return msg.slice(0, 300);
  };

  // 构建请求体：DeepSeek 官方 API 使用 thinking: {type: "disabled"} 关闭思考
  // 同时保留 reasoning_effort: "none" 作为兜底
  var buildRequestBody = (apiCfg, messages) => {
    return {
      model: apiCfg.model,
      messages,
      temperature: 0.2,
      max_tokens: apiCfg.maxTokens,
      // DeepSeek 官方关闭思考模式
      thinking: { type: "disabled" },
      // 思考强度设为 none（部分兼容接口使用）
      reasoning_effort: "none"
    };
  };

  var callAIOnce = (messages) => new Promise((resolve, reject) => {
    const apiCfg = getApiCfg();
    const reqBody = buildRequestBody(apiCfg, messages);

    console.log("[ZHS-AI] ========== 请求开始 ==========");
    console.log("[ZHS-AI] URL:", `${apiCfg.baseUrl.replace(/\/$/, "")}/chat/completions`);
    console.log("[ZHS-AI] Model:", apiCfg.model);
    console.log("[ZHS-AI] MaxTokens:", apiCfg.maxTokens);
    console.log("[ZHS-AI] Timeout(ms):", apiCfg.timeoutMs);
    console.log("[ZHS-AI] 关闭思考参数:", {
      thinking: { type: "disabled" },
      reasoning_effort: "none"
    });



    GM_xmlhttpRequest({
      method: "POST",
      url: `${apiCfg.baseUrl.replace(/\/$/, "")}/chat/completions`,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiCfg.apiKey}`
      },
      data: JSON.stringify(reqBody),
      timeout: apiCfg.timeoutMs,
      onload: (res) => {
        console.log("[ZHS-AI] HTTP 状态:", res.status);

        if (res.status < 200 || res.status >= 300) {
          const detail = parseApiError(res);
          reject(new Error(`AI HTTP ${res.status}${detail ? " | " + detail : ""}`));
          return;
        }
        try {
          const data = JSON.parse(res.responseText);
          const msg = data?.choices?.[0]?.message;
          const text = msg?.content;
          const reasoning = msg?.reasoning_content;

          if (reasoning && reasoning.length > 0) {
            console.warn(
              `[ZHS-AI] ⚠️ 模型仍在推理模式！reasoning_content 长度 = ${reasoning.length}，` +
              `content 长度 = ${(text || "").length}`
            );

          } else {
            console.log("[ZHS-AI] ✅ 思考模式已关闭（无 reasoning_content）");
          }


          console.log("[ZHS-AI] usage:", data?.usage);
          console.log("[ZHS-AI] ========== 请求结束 ==========");
          resolve((text || "").trim());
        } catch (e) {
          console.error("[ZHS-AI] 响应解析失败:", e.message);
          reject(new Error(`AI 响应解析失败: ${e.message}`));
        }
      },
      onerror: () => {
        console.error("[ZHS-AI] 网络错误");
        reject(new Error("AI 网络错误"));
      },
      ontimeout: () => {
        console.error("[ZHS-AI] 请求超时");
        reject(new Error("AI 请求超时"));
      }
    });
  });
  var requestAI = async (buildMessages, validate) => {
    const chatState = createAIChatState();
    for (let attempt = 1; attempt <= AI_CHAT.maxAttempts; attempt++) {
      chatState.attempt = attempt;
      chatState.status = attempt === 1 ? AI_STATUS.REQUESTING : AI_STATUS.RETRYING;
      try {
        const messages = buildMessages(attempt, chatState);
        chatState.memory = messages;
        console.log(`[ZHS-AI] 第 ${attempt}/${AI_CHAT.maxAttempts} 次尝试`);
        const raw = await callAIOnce(messages);
        chatState.lastRaw = raw;
        console.log(`[ZHS-AI] 第 ${attempt} 次 AI 原始输出:`, JSON.stringify(raw));
        console.log(`[ZHS-AI] 第 ${attempt} 次 AI 解析字母:`, extractAnswerLetters(raw));
        if (validate(raw)) {
          chatState.status = AI_STATUS.SUCCESS;
          console.log(`[ZHS-AI] 第 ${attempt} 次校验通过 ✅`);
          return { raw, state: chatState };
        }
        chatState.lastError = "答案格式不合规";
        console.warn(`[ZHS-AI] 第 ${attempt} 次校验不通过 ❌`);
      } catch (e) {
        chatState.lastError = e.message || String(e);
        console.error(`[ZHS-AI] 第 ${attempt} 次请求异常:`, e);
      }
      if (attempt < AI_CHAT.maxAttempts) {
        console.log(`[ZHS-AI] ${AI_CHAT.retryDelayMs}ms 后重试…`);
        await sleep(AI_CHAT.retryDelayMs);
      }
    }
    chatState.status = AI_STATUS.FAILED;
    if (chatState.lastError === "答案格式不合规") {
      throw new Error(`AI 答案不合规，已重试 ${AI_CHAT.maxAttempts} 次: ${chatState.lastRaw}`);
    }
    throw new Error(`AI 请求失败，已重试 ${AI_CHAT.maxAttempts} 次: ${chatState.lastError}`);
  };
  var buildQuizMessages = (blocks, optLines, attempt, chatState, isMultiple = false, isScreenshot = false) => {
    const memory = chatState.memory || [];
    const sysPrompt = isMultiple
      ? "你是做题助手，直接输出正确选项的字母，不要任何解释或多余内容。多选时连续输出，例如 ABC。"
      : "你是做题助手，直接输出正确选项的字母，不要任何解释或多余内容。";
    if (!memory.length) {
      memory.push({
        role: "system",
        content: sysPrompt
      });
    }
    if (attempt > 1 && chatState.lastRaw) {
      memory.push({
        role: "assistant",
        content: chatState.lastRaw
      });
    }
    if (memory.length < 2) {
      let content;
      if (isScreenshot) {
        content = [
          { type: "text", text: "阅读截图中的题目与选项，只输出正确选项的字母。" },
          { type: "image_url", image_url: { url: blocks } }
        ];
      } else {
        const blocksToMarkdown2 = (blks) => blks.map((b) => b.type === "text" ? b.content : `[IMAGE:${b.index}]`).join("\n");
        content = [{ type: "text", text: `题目：

${blocksToMarkdown2(blocks)}

选项：
${optLines.join("\n")}

只输出正确选项的字母。` }];
        blocks.filter((b) => b.type === "image").forEach((b) => content.push({ type: "image_url", image_url: { url: b.src } }));
      }
      memory.push({
        role: "user",
        content
      });
    }
    if (attempt > 1) {
      memory.push({
        role: "user",
        content: `

上次回答不合规。请只输出正确选项的字母，不要任何其他内容。`
      });
    }
    return memory;
  };
  var parseAnswerLetters = (raw) => extractAnswerLetters(raw);
  var answerWithAI = async (blocks, screenshotBase64 = null, refreshAttempt = 0) => {
    const mc = isMultipleChoice();
    const opts = getQuizOptions();
    if (!opts.length) return null;
    if (unsafeWindow.__ZHS_STOP) throw new Error("已停止");
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
    const optLines = opts.map((opt, i) => `${snapshot.labels[i]}. ${reviewOptionKey(opt)}`);
    const isScreenshot = !!screenshotBase64;
    const input = isScreenshot ? screenshotBase64 : blocks;
    const { raw } = await requestAI(
      (attempt, chatState) => buildQuizMessages(input, optLines, attempt, chatState, mc, isScreenshot),
      (raw2) => isValidQuizAnswer(raw2, opts.length)
    );
    if (unsafeWindow.__ZHS_STOP) throw new Error("已停止");
    const fresh = reviewSnapshot(reviewQuizQuestion(), getQuizOptions(), isMultipleChoice());
    if (!snapshot || !fresh || snapshot.key !== fresh.key || JSON.stringify(snapshot.choices) !== JSON.stringify(fresh.choices) || JSON.stringify(snapshot.labels)!==JSON.stringify(fresh.labels))
      throw new Error('等待 AI 时题目或选项发生变化，已停止');
    const letters = parseAnswerLetters(raw);
    const verified=await reviewApplyLetters(letters.join(''), opts, mc);
    reviewAudit(snapshot,'ai',letters.join(''),verified);
    return raw;
  };

  // src/homework.js
  var getHomeworkUnansweredButton = () => {
    return document.querySelector(".border-black\\/20.text-black\\/60.border");
  };
  var isHomeworkCurrentAnswered = () => {
    const selectedCircle = document.querySelector(".question-area-content .bg-mainBg");
    return !!selectedCircle;
  };
  var getHomeworkSubmitButton = () => {
    const allDivs = [...document.querySelectorAll("div, button")];
    return allDivs.find((el) => {
      const classes = el.className || "";
      const hasBg = typeof classes === "string" && classes.includes("bg-[#0D0D0D]");
      const hasText = (el.innerText || "").includes("提交作业");
      return hasBg || hasText;
    });
  };
  var buildHomeworkQuizMessages = (input, images, attempt, chatState, isSingle = true, isScreenshot = false) => {
    const memory = chatState.memory || [];
    const sysPrompt = isSingle
      ? "你是做题助手，直接输出正确选项的字母，不要任何解释或多余内容。"
      : "你是做题助手，直接输出正确选项的字母，不要任何解释或多余内容。多选时连续输出，例如 ABC。";
    if (!memory.length) {
      memory.push({
        role: "system",
        content: sysPrompt
      });
    }
    if (attempt > 1 && chatState.lastRaw) {
      memory.push({
        role: "assistant",
        content: chatState.lastRaw
      });
    }
    if (memory.length < 2) {
      let content;
      if (isScreenshot) {
        content = [
          { type: "text", text: "阅读截图中的题目与选项，只输出正确选项的字母。" },
          { type: "image_url", image_url: { url: input } }
        ];
      } else {
        content = [{ type: "text", text: `完整题目与选项内容如下：

${input}

只输出正确选项的字母。` }];
        images.forEach((src) => content.push({ type: "image_url", image_url: { url: src } }));
      }
      memory.push({
        role: "user",
        content
      });
    }
    if (attempt > 1) {
      memory.push({
        role: "user",
        content: `

上次回答不合规。请只输出正确选项的字母，不要任何其他内容。`
      });
    }
    return memory;
  };
  var isValidHomeworkAnswer = (raw) => {
    const letters = extractAnswerLetters(raw);
    if (!letters.length) return false;
    const count = document.querySelectorAll(".question-area-content .flex.items-center.gap-4.user-select.group").length;
    if (count > 0) {
      return letters.every((l) => {
        const idx = l.charCodeAt(0) - 65;
        return idx >= 0 && idx < count;
      });
    }
    return letters.length <= 6;
  };
  var answerHomeworkWithAI = async (input, images, isSingle, isScreenshot = false) => {
    const { raw } = await requestAI(
      (attempt, chatState) => buildHomeworkQuizMessages(input, images, attempt, chatState, isSingle, isScreenshot),
      (raw2) => isValidHomeworkAnswer(raw2)
    );
    return raw;
  };
  async function runHomeworkQuiz() {
    while (!unsafeWindow.__ZHS_STOP) {
      await waitFor(() => !document.querySelector(".el-loading-spinner"), 15e3);
      const container = await waitFor(() => {
        const el = document.querySelector(".question-area-content");
        if (!el || !el.innerText.trim()) return null;
        const opts = el.querySelectorAll(".flex.items-center.gap-4.user-select.group");
        if (opts.length === 0) return null;
        return opts[0].innerText.trim() ? el : null;
      }, 15e3);
      if (!container) return false;
      const oldText = container.innerText;
      panelNotify("quiz", { phase: "start" });
      const typeEl = document.querySelector(".text-green");
      const isSingle = !!(typeEl && typeEl.innerText.includes("单选"));
      let aiRaw;
      try {
        const engineMode = GM_getValue("zhs_engine_mode", "traditional");
        if (engineMode === "screenshot") {
          const screenshot = await captureElement(container);
          aiRaw = await answerHomeworkWithAI(screenshot, [], isSingle, true);
        } else {
          const blocks = await getQuestionBlocks(container);
          const questionContent = blocksToMarkdown(blocks);
          const images = blocks.filter((b) => b.type === "image").map((b) => b.src);
          aiRaw = await answerHomeworkWithAI(questionContent, images, isSingle, false);
        }
        panelNotify("quiz", { phase: "done", aiOutput: aiRaw });
      } catch (e) {
        panelNotify("error", e?.message || "AI 答题失败");
        return false;
      }
      const letters = parseAnswerLetters(aiRaw);
      const optionContainers = [...container.querySelectorAll(".flex.items-center.gap-4.user-select.group")];
      for (const letter of letters) {
        let targetOption = optionContainers.find((opt) => {
          const circle = opt.querySelector(".font-AP-65");
          if (!circle) return false;
          const circleLetter = circle.innerText.replace(/[^A-Za-z]/g, "").toUpperCase();
          return circleLetter === letter;
        });
        if (!targetOption) {
          const idx = letter.charCodeAt(0) - 65;
          if (idx >= 0 && idx < optionContainers.length) {
            targetOption = optionContainers[idx];
          }
        }
        if (targetOption) {
          click(targetOption);
          await waitFor(() => {
            const circle = targetOption.querySelector(".font-AP-65");
            return circle && (circle.classList.contains("bg-mainBg") || circle.classList.contains("text-white")) ? true : null;
          }, 3e3);
        }
      }
      const nextUnansweredBtn = getHomeworkUnansweredButton();
      if (nextUnansweredBtn) {
        click(nextUnansweredBtn);
        await sleep(10);
        await waitFor(() => !document.querySelector(".el-loading-spinner"), 1e4);
        const changed = await waitFor(() => {
          const curContainer = document.querySelector(".question-area-content");
          if (!curContainer) return null;
          const text = curContainer.innerText.trim();
          if (text === oldText) return null;
          const opts = curContainer.querySelectorAll(".flex.items-center.gap-4.user-select.group");
          if (opts.length === 0) return null;
          const imgs = curContainer.querySelectorAll("img");
          if ([...imgs].some((img) => !img.complete)) return null;
          return opts[0].innerText.trim() ? true : null;
        }, 8e3);
        if (!changed) {
          panelNotify("error", "切换下一题失败");
          return false;
        }
      } else {
        if (isHomeworkCurrentAnswered()) {
          const submitBtn = getHomeworkSubmitButton();
          if (submitBtn) {
            click(submitBtn);
            return true;
          } else {
            panelNotify("error", "未找到提交作业按钮");
            return false;
          }
        } else {
          panelNotify("error", "题号答完但当前题目没有被勾选，请重试");
          return false;
        }
      }
    }
    return false;
  }
  async function runHomeworkFlow() {
    if (unsafeWindow.__ZHS_CHAIN_RUNNING) return;
    unsafeWindow.__ZHS_CHAIN_RUNNING = true;
    panelNotify("start");
    try {
      panelNotify("screen", SCREENS.QUIZ);
      const success = await runHomeworkQuiz();
      if (success) {
        panelNotify("hop", { screen: SCREENS.QUIZ, action: "作业答题完成并已提交！" });
      } else {
        panelNotify("error", "未识别到题目页面，或答题中断");
      }
    } catch (e) {
      panelNotify("error", e?.message || "作业答题发生错误");
    } finally {
      unsafeWindow.__ZHS_CHAIN_RUNNING = false;
      setLoopKey(false);
      panelNotify("done");
    }
  }

  // src/flow.js
  async function runListHop() {
    if (!isLoopOn()) return false;
    const learning=GM_getValue(LEARN_STATE,null);
    if(learnRoute(learning?.url)?.listUrl===reviewListUrl(location.href)) {
      reviewNavigate(learning.url);return !!await reviewWait(()=>!!learnRoute());
    }
    const hasDashboard = await waitFor(() => {
      const el2 = [...document.querySelectorAll(".el-progress--dashboard")].find(reviewVisible);
      return el2 && /\d+/.test(el2.innerText || "") ? el2 : null;
    }, 3e4);
    if (!hasDashboard) return false;
    if (!hasListWork()) {
      setLoopKey(false);
      return false;
    }
    const el = await waitFor(() => findLowPctProgress(true));
    if(!el || unsafeWindow.__ZHS_STOP) return false;
    const oldUrl=location.href;
    click(el);
    return !!await reviewWait(() => location.href!==oldUrl || (detectScreen()!==SCREENS.LIST && detectScreen()!==SCREENS.UNKNOWN));
  }
  async function runDetailHop() {
    setLoopKey(true);
    return clickUntilGone(".simplified-mastery__action");
  }
  async function runDetailExitHop() {
    setLoopKey(true);
    return clickUntilGone(NAV_BACK_SEL);
  }
  async function runPreQuizHop() {
    setLoopKey(true);
    return clickUntilGone(".improve-btn", 2e4, 5e3);
  }
  async function runQuizHop() {
    const isReady = await waitFor(() => {
      const q = reviewQuizQuestion();
      if (reviewHasFill()) return q || document.body;
      if (!q || !q.innerText.trim()) return null;
      const mc = !!document.querySelector(".el-checkbox-group.checkbox-view");
      const opts = mc ? document.querySelectorAll(".el-checkbox-group.checkbox-view .el-checkbox") : document.querySelectorAll("ul.radio-view li");
      return opts.length > 0 && opts[0].innerText.trim() ? q : null;
    }, 3e4);
    if (!isReady) return false;
    if (reviewHasFill()) return reviewSkipFill();
    const oldText = isReady.innerText;
    panelNotify("quiz", { phase: "start" });
    try {
      const engineMode = GM_getValue("zhs_engine_mode", "traditional");
      let aiRaw;
      if (engineMode === "screenshot") {
        const target = getScreenshotTarget(SCREENS.QUIZ);
        if (!target) throw new Error("未找到截图目标元素");
        const screenshot = await captureElement(target);
        aiRaw = await answerWithAI(null, screenshot);
      } else {
        aiRaw = await answerWithAI(await readQuestion());
      }
      panelNotify("quiz", { phase: "done", aiOutput: aiRaw });
    } catch (e) {
      panelNotify("error", e?.message || "AI 答题失败");
      return false;
    }
    if (unsafeWindow.__ZHS_STOP) return false;
    setLoopKey(true);
    if (getMismatchNode()) {
      return clickUntilGone(() => {
        const currentQ = reviewQuizQuestion();
        if (!currentQ || currentQ.innerText !== oldText) return null;
        return getMismatchNode();
      });
    }
    GM_setValue(REVIEW_PENDING, true);
    const stats=reviewGetStats();
    panelNotify('memory', `本轮已核对：参考答案 ${stats.hits} 题，AI ${stats.ai} 题，错配拦截 ${stats.blocked} 题`);
    GM_setValue('zhs_reference_stats_v1',{...stats,closed:true});
    panelNotify("hop", { screen: SCREENS.QUIZ, action: "提交练习，随后读取解析" });
    setLoopKey(true);
    return clickUntilGone(".reviewDone.ZHIHUISHU_QZMD");
  }
  async function runResultHop() {
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
  async function runOneHop(screen, expectDetailForward) {
    switch (screen) {
      case SCREENS.LEARN:
        return learnRun();
      case SCREENS.HISTORY:
        return reviewRunHistory();
      case SCREENS.REVIEW:
        return reviewRunPage();
      case SCREENS.LIST:
        return runListHop();
      case SCREENS.DETAIL:
        return expectDetailForward ? runDetailHop() : runDetailExitHop();
      case SCREENS.PRE_QUIZ:
        return runPreQuizHop();
      case SCREENS.QUIZ:
        return runQuizHop();
      case SCREENS.RESULT:
        return runResultHop();
      default:
        return false;
    }
  }
  async function runFromHere() {
    if (unsafeWindow.__ZHS_CHAIN_RUNNING) return;
    if(!GM_getValue(REVIEW_SEQUENCE,null)) reviewSequenceSeed();
    const mode = GM_getValue("zhs_run_mode", "chain");
    if (mode === "homework") {
      return runHomeworkFlow();
    }
    unsafeWindow.__ZHS_CHAIN_RUNNING = true;
    panelNotify("start");
    try {
      let hops = 0;
      let expectDetailForward = false;
      while (hops < MAX_HOPS && isLoopOn() && !unsafeWindow.__ZHS_STOP) {
        hops += 1;
        let screen = detectScreen();
        if (screen === SCREENS.UNKNOWN) {
          const found = await waitFor(() => detectScreen() !== SCREENS.UNKNOWN ? true : null, 15e3);
          if (!found) {
            setLoopKey(false);
            panelNotify("error", "未识别页面，停止");
            break;
          }
          screen = detectScreen();
          if (screen === SCREENS.UNKNOWN) {
            setLoopKey(false);
            panelNotify("error", "未识别页面，停止");
            break;
          }
        }
        panelNotify("screen", screen);
        const progressed = await runOneHop(screen, expectDetailForward);
        if (!progressed) {
          setLoopKey(false);
          panelNotify("error", `${SCREEN_LABELS[screen] || screen}：本步未推进`);
          break;
        }
        panelNotify("hop", { screen, expectDetailForward });
        if (screen === SCREENS.LIST && progressed) expectDetailForward = true;
        if (screen === SCREENS.DETAIL && expectDetailForward && progressed) expectDetailForward = false;
        await sleep(ROUTE_SETTLE_MS);
        if (detectScreen() === SCREENS.LIST && !hasListWork()) {
          setLoopKey(false);
          panelNotify("hop", { screen: SCREENS.LIST, action: "本次起点之后已无待处理知识点，结束顺序流程" });
          break;
        }
      }
    } finally {
      unsafeWindow.__ZHS_CHAIN_RUNNING = false;
      panelNotify("done");
    }
  }
  function startChain() {
    unsafeWindow.__ZHS_STOP = false;
    if(reviewListUrl(location.href)) GM_setValue(LEARN_STATE,null);
    reviewSequenceSeed();
    setLoopKey(true);
    runFromHere();
  }
  function stopChain() {
    unsafeWindow.__ZHS_STOP = true;
    setLoopKey(false);
    panelNotify("stop");
  }

  // Local review-memory controls.
  GM_registerMenuCommand("顺序进度：查看", () => {
    const learning=GM_getValue(LEARN_STATE,null);
    if(learning) {alert(`当前知识点：${learning.title}\n已向后处理 ${learning.completed?.length||0} 节；按左侧目录继续。`);return;}
    const state=GM_getValue(REVIEW_SEQUENCE,null);
    alert(state?`起点：${state.anchor?.title||state.anchor?.rowText||'列表首项'}\n进度：${state.position}/${state.queue?.length||'待定位'}\n只向后处理，不回到前面的低分项。`:'尚未设置顺序起点');
  });
  GM_registerMenuCommand("顺序进度：清除并重新设起点", () => {
    stopChain();GM_setValue(REVIEW_SEQUENCE,null);GM_setValue(REVIEW_LIST_CONTEXT,{});GM_setValue(LEARN_STATE,null);
    panelNotify('memory','顺序进度已清除。请打开要开始的知识点练习，再点开始/继续');
  });
  GM_registerMenuCommand("填空跳过：查看标记", () => {
    const items=Object.values(GM_getValue(REVIEW_SKIP_STORE,{}));
    alert(items.length?items.map(x=>`${x.title||x.rowText}：${x.reason}`).join('\n'):'暂无填空题跳过标记');
  });
  GM_registerMenuCommand("填空跳过：清除标记", () => {
    GM_setValue(REVIEW_SKIP_STORE,{});
    document.querySelectorAll('[data-zhs-skip-label]').forEach(x=>x.remove());
    panelNotify('memory','填空题跳过标记已清除，下次循环将重新检查');
  });
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
  // src/index.js
  document.addEventListener("click",reviewCaptureListClick,true);
  GM_registerMenuCommand("最小链路：开始/继续", startChain);
  GM_registerMenuCommand("最小链路：停止", stopChain);
  GM_registerMenuCommand("设置 API 配置", () => {
    const url = prompt("输入 API Base URL（如 https://api.deepseek.com）:", GM_getValue("zhs_api_baseurl", ""));
    if (url !== null) GM_setValue("zhs_api_baseurl", url.trim());
    const key = prompt("输入 API Key:", GM_getValue("zhs_api_apikey", ""));
    if (key !== null) GM_setValue("zhs_api_apikey", key.trim());
    const model = prompt("输入 Model Name（如 deepseek-chat,qwen-vl-plus）:", GM_getValue("zhs_api_model", ""));
    if (model !== null) GM_setValue("zhs_api_model", model.trim());
    const maxTokens = prompt("输入 Max Tokens（默认 2048）:", GM_getValue("zhs_api_maxtokens", 2048));
    if (maxTokens !== null) saveMaxTokens(maxTokens);
    const timeout = prompt("输入 Timeout (ms)（默认 120000）:", GM_getValue("zhs_api_timeout", 12e4));
    if (timeout !== null) saveTimeout(timeout);
  });
  var panelCtx2 = createPanel({ onStart: startChain, onStop: stopChain });
  panelNotify("init");
  panelNotify("screen", detectScreen());
  var idleRefreshTimer = setInterval(() => {
    if (!unsafeWindow.__ZHS_CHAIN_RUNNING) {
      panelNotify("screen", detectScreen());
    }
  }, 2e3);
  window.addEventListener("beforeunload", () => clearInterval(idleRefreshTimer));
  waitFor(() => detectScreen() !== SCREENS.UNKNOWN ? true : null, 15e3).then(() => {
    if (isLoopOn() && !unsafeWindow.__ZHS_STOP) runFromHere();
  });
})();
