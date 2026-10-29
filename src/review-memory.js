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
    // Preview uses Element Plus option groups, while the answering page uses radio-view.
    // Read DOM beyond the viewport and sweep scroll containers for lazy-loaded questions.
    let lastSignature='', stable=0;
    const ready=await reviewWait(() => {
      if ([...document.querySelectorAll('.el-loading-spinner')].some(reviewVisible)) return null;
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
    const result=await reviewScanPage();
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
