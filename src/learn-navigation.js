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
