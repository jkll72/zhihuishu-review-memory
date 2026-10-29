const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');
const source=fs.readFileSync(require('node:path').join(__dirname,'..','zhihuishu-review-memory.user.js'),'utf8');
let passed=0;
function env(html='',url='https://ai-smart-course-student-pro.zhihuishu.com/practice/1') {
  const dom=new JSDOM(html,{url,runScripts:'outside-only'});
  const w=dom.window, values=new Map();
  w.unsafeWindow=w; w.GM_getValue=(k,d)=>values.has(k)?values.get(k):d;
  w.GM_setValue=(k,v)=>values.set(k,JSON.parse(JSON.stringify(v)));
  w.GM_registerMenuCommand=()=>{}; w.console={...console,log:()=>{}};
  const exportCode=`window.t={reviewSnapshot,reviewLookup,reviewSave,reviewParsePublished,reviewCollectVisible,reviewIsPage,reviewIsHistory,reviewApplyLetters,reviewReadStore,reviewRunHistory,reviewRunPage,answerWithAI,detectScreen,runResultHop,SCREENS,reviewButton,reviewRunPage,reviewHistoryState,reviewOptionState,reviewUnits,reviewScanPage,reviewAuditReport,reviewCurrentQuiz,reviewHashBlob,reviewWarmImageTexts,
    reviewHasFill,reviewSkipFill,reviewSkipFor,reviewRememberList,findLowPctProgress,runQuizHop,runListHop,reviewPracticeInfo,reviewSequenceSeed,reviewCaptureListClick,
    learnRoute,learnCatalogRoot,learnItems,learnTitle,learnMastery,learnScanCatalog,learnRun,learnSeed,learnReturnUrl,reviewLayoutDiagnostic,
    learnRecordMastery,learnKnownMastery,learnReadPublishedMastery,
    setReader(fn){readQuestion=fn},setPrepare(fn){reviewPrepareReference=fn},
    setNavigate(fn){reviewNavigate=fn},setAI(fn){requestAI=fn},setSleep(fn){sleep=fn},setWait(fn){reviewWait=fn},setClick(fn){click=fn},setPanel(fn){panelNotify=fn},setImageFetcher(fn){reviewFetchImageHash=fn}};return;`;
  w.eval(source.replace('  // Local review-memory controls.',exportCode+'\n  // Local review-memory controls.'));
  return {w,t:w.t,values,close:()=>w.close()};
}
function card(stem='求 ∮ f(z) dz',opts=['0','2πi','1'],answer='B',multi=false) {
  return `<section><div class="questionContent">${stem}</div>${multi?
    `<div class="el-checkbox-group checkbox-view">${opts.map((o,i)=>`<label class="el-checkbox"><span class="letterSortNum">${String.fromCharCode(65+i)}</span><span>${o}</span></label>`).join('')}</div>`:
    `<ul class="radio-view">${opts.map((o,i)=>`<li><span class="letterSortNum">${String.fromCharCode(65+i)}</span><span>${o}</span></li>`).join('')}</ul>`}
    ${answer===null?'':`<div class="answer"><span>正确答案：</span><span>${answer}</span></div><div>我的答案：C</div>`}</section>`;
}
function snapshot(e){return e.t.reviewSnapshot(e.w.document.querySelector('.questionContent'),[...e.w.document.querySelectorAll('ul.radio-view li,.checkbox-view .el-checkbox')],!!e.w.document.querySelector('.checkbox-view'));}
function previewCard(number,stem,opts,answer,multi=false) {
  return `<article class="new-preview-card"><header><span>${multi?'多选题':opts.includes('错')?'判断题':'单选题'}</span><button>AI答题辅导</button><div>收藏为薄弱题</div></header>
    <div class="richtext"><span>${number}、</span><div>${stem}</div></div><div class="options-and-answer">
    <div class="${multi?'el-checkbox-group':'el-radio-group'}" ${multi?'aria-label="checkbox-group" role="group"':'role="radiogroup"'}>
    ${opts.map((o,i)=>`<label class="${multi?'el-checkbox':'el-radio'} is-disabled"><span class="${multi?'el-checkbox__input':'el-radio__input'}"><input disabled type="${multi?'checkbox':'radio'}"></span><span class="${multi?'el-checkbox__label':'el-radio__label'}">${opts.includes('错')?'':String.fromCharCode(65+i)+'. '}${o}</span></label>`).join('')}
    </div><div class="feedback">回答正确～</div><div class="reference"><p>参考答案：${answer}</p><p>答案解析：例题解释</p></div></div></article>`;
}
function test(name,fn){return Promise.resolve().then(fn).then(()=>{passed++;console.log('PASS',name)});}
(async()=>{
  const learnUrl='https://ai-smart-course-student-pro.zhihuishu.com/learnPage/1000000000000000005/1000000000000000002/100001?catalogActiveTab=personal';
  await test('actual plain learning title and combined required-progress badges are recognized',async()=>{
    const e=env('<aside><section class="el-collapse-item"><button class="el-collapse-item__header" aria-expanded="true">知识单元：傅里叶变换的性质</button><div><div class="lesson"><div>卷积与卷积定理</div><div>必学 1/1</div></div><div class="lesson"><div>傅里叶变换综合举例</div><div>必学 1/1</div></div></div></section><section class="el-collapse-item"><button class="el-collapse-item__header" aria-expanded="true">知识模块 拉普拉斯变换</button><div><div class="lesson"><div>拉普拉斯变换的定义</div><div>必学 1/1</div></div></div></section></aside><main><div><div>傅里叶变换综合举例</div><div>知识图谱</div></div><iframe></iframe><div><span>知识点最高掌握度：</span><strong>44%</strong><button>去提升</button></div></main>',learnUrl.replace('1000000000000000002','1000000000000000003'));
    assert.equal(e.t.learnItems(e.t.learnCatalogRoot()).length,3);
    assert.equal(e.t.learnTitle(),'傅里叶变换综合举例');assert.equal(e.t.learnMastery(),44);
    e.t.setWait(async fn=>fn());e.w.document.querySelector('main button').onclick=()=>e.w.history.pushState({},'', '/masteryHistory/1000000000000000005/100001/1000000000000000003');
    assert.equal(await e.t.learnRun(),true);e.close();
  });
  await test('encoded preview title is decoded before seeding the forward start',()=>{
    const encoded='JTIyJUU1JTgyJTg1JUU5JTg3JThDJUU1JThGJUI2JUU1JThGJTk4JUU2JThEJUEyJUU3JUJCJUJDJUU1JTkwJTg4JUU0JUI4JUJFJUU0JUJFJThCJTIy';
    const e=env('','https://ai-smart-course-student-pro.zhihuishu.com/examPreview/1000000000000000005/1/2/1000000000000000003/100001?nodeName='+encoded);
    assert.equal(e.t.reviewPracticeInfo().title,'傅里叶变换综合举例');e.t.reviewSequenceSeed();
    assert.equal(e.values.get('zhs_forward_sequence_v1').anchor.title,'傅里叶变换综合举例');e.close();
  });
  await test('mastery binds to sibling label in a footer and ignores viewer zoom',()=>{
    const e=env('<div>PDF缩放77%</div><footer><span>知识点最高掌握度</span><strong>44 ％</strong><button>去提升</button></footer>',learnUrl);
    assert.equal(e.t.learnMastery(),44);e.close();
  });
  function learnFixture(pct=95) {
    const section=(name,items)=>`<section class="el-collapse-item"><button class="el-collapse-item__header" aria-expanded="false">${name}</button><div class="el-collapse-item__wrap" style="display:none">${items.map(title=>`<div class="lesson"><span>${title}</span><span>必学</span><span>/1</span></div>`).join('')}</div></section>`;
    const e=env(`<aside style="overflow-y:auto">${section('知识模块 傅里叶变换',['傅里叶变换的基本性质','卷积与卷积定理','傅里叶变换综合举例'])}${section('知识模块 拉普拉斯变换',['拉普拉斯变换的概念'])}</aside><main><h1>卷积与卷积定理</h1><iframe></iframe><div id="mastery">知识点最高掌握度：<span>${pct}%</span></div><button id="improve">去提升</button></main><div>AI学伴<textarea></textarea></div>`,learnUrl);
    for(const header of e.w.document.querySelectorAll('.el-collapse-item__header'))header.onclick=()=>{header.setAttribute('aria-expanded','true');header.nextElementSibling.style.display='block';};
    e.t.setSleep(async()=>{});return e;
  }
  await test('history mastery above threshold persists through a stale learning value and advances',async()=>{
    const history=env('<div>掌握度 96%</div><button>去提升</button><button>查看解析</button>','https://ai-smart-course-student-pro.zhihuishu.com/masteryHistory/1000000000000000005/100001/1000000000000000002');
    history.values.set('zhs_learn_navigation_v1',{...history.t.learnRoute(learnUrl),title:'卷积与卷积定理',phase:'practice',attempts:{},completed:[]});
    history.values.set('zhs_review_pending_v1',true);let clicks=0,destination='';history.w.document.addEventListener('click',()=>clicks++);
    history.t.setNavigate(url=>destination=url);history.t.setWait(async()=>true);
    assert.equal(await history.t.reviewRunHistory(),true);assert.equal(clicks,0);assert.equal(destination,learnUrl);
    const saved=history.values.get('zhs_learn_navigation_v1');assert.equal(saved.mastery['1000000000000000002'].pct,96);history.close();
    const e=learnFixture(77);e.values.set('zhs_learn_navigation_v1',saved);e.values.set('zhs_review_pending_v1',true);
    let selected='';for(const row of e.w.document.querySelectorAll('.lesson'))row.onclick=()=>{selected=row.firstElementChild.textContent;e.w.history.pushState({},'', '/learnPage/1000000000000000005/next/100001');};
    e.w.document.getElementById('improve').onclick=()=>{throw Error('Mastered point cannot re-enter practice')};e.t.setWait(async fn=>fn());
    assert.equal(await e.t.learnRun(),true);assert.equal(selected,'傅里叶变换综合举例');assert.equal(e.values.get('zhs_review_pending_v1'),false);e.close();
  });
  await test('exactly 90 is achieved and advances to the next lesson without another practice',async()=>{
    const e=learnFixture(90);let selected='';
    e.w.document.getElementById('improve').onclick=()=>{throw Error('90 percent is achieved')};
    for(const row of e.w.document.querySelectorAll('.lesson'))row.onclick=()=>{selected=row.firstElementChild.textContent;e.w.history.pushState({},'', '/learnPage/1000000000000000005/next/100001');};
    e.t.setWait(async fn=>fn());assert.equal(await e.t.learnRun(),true);assert.equal(selected,'傅里叶变换综合举例');e.close();
  });
  await test('confirmed mastery is scoped to course class and point rather than a shared title',()=>{
    const e=learnFixture(77);e.t.learnSeed();const route=e.t.learnRoute();
    e.t.learnRecordMastery(99,{listUrl:route.listUrl,point:'different-point',title:'卷积与卷积定理'});assert.equal(e.t.learnKnownMastery(),null);
    e.t.learnRecordMastery(99,{listUrl:route.listUrl.replace('100001','999'),point:route.point,title:'卷积与卷积定理'});assert.equal(e.t.learnKnownMastery(),null);
    e.t.learnRecordMastery(91);e.t.learnRecordMastery(77);assert.equal(e.t.learnKnownMastery(),91);e.close();
  });
  await test('history exactly 90 is read as mastery and quiz score is not mastery',()=>{
    const e=env('<div>掌握度90%</div><div>练习得分100%</div>','https://ai-smart-course-student-pro.zhihuishu.com/masteryHistory/99/22/33');
    assert.equal(e.t.learnReadPublishedMastery(),90);e.w.document.body.innerHTML='<div>练习得分100%</div>';assert.equal(e.t.learnReadPublishedMastery(),null);e.close();
  });
  await test('result page with explicit mastery above threshold returns without opening more practice',async()=>{
    const e=env('<div class="charts-rate"><span>知识点掌握度：95%</span></div><button>查看解析</button>','https://ai-smart-course-student-pro.zhihuishu.com/masteryHistory/1000000000000000005/100001/1000000000000000002');
    e.values.set('zhs_learn_navigation_v1',{...e.t.learnRoute(learnUrl),title:'卷积与卷积定理',phase:'practice',attempts:{},completed:[]});e.values.set('zhs_review_pending_v1',true);
    let destination='',clicks=0;e.t.setNavigate(url=>destination=url);e.t.setWait(async()=>true);e.w.document.addEventListener('click',()=>clicks++);
    assert.equal(await e.t.runResultHop(),true);assert.equal(clicks,0);assert.equal(destination,learnUrl);assert.equal(e.t.learnKnownMastery(),95);e.close();
  });
  await test('unstarted next lesson with separate zero and fraction retains its correct title',async()=>{
    const e=learnFixture(95);const lesson=e.w.document.querySelectorAll('.lesson')[2];lesson.innerHTML='<span>傅里叶变换综合举例</span><span>必学</span><span>0</span><span>/1</span>';
    const scan=await e.t.learnScanCatalog();assert(scan.items.some(row=>row.title==='傅里叶变换综合举例'));assert(!scan.items.some(row=>row.title==='傅里叶变换综合举例0'));e.close();
  });
  await test('learning improve button with font icon and SVG title is clicked as one control',async()=>{
    const e=learnFixture(77),button=e.w.document.getElementById('improve');
    button.innerHTML='去提升<i class="iconfont">\ue601</i><svg><title>arrow-right</title><path></path></svg>';
    let clicks=0;button.onclick=()=>{clicks++;e.w.history.pushState({},'', '/masteryHistory/1000000000000000005/100001/1000000000000000002');};
    e.t.setNavigate(()=>{throw Error('The visible button must be used')});e.t.setWait(async fn=>fn());
    assert.equal(await e.t.learnRun(),true);assert.equal(clicks,1);e.close();
  });
  await test('missing improve button opens the exact supplied point history without changing course',async()=>{
    const e=learnFixture(77);e.w.history.replaceState({},'', '/learnPage/1000000000000000005/1000000000000000004/100001?mapUid=&catalogActiveTab=personal');
    e.w.document.querySelector('h1').textContent='微分性质';e.w.document.getElementById('improve').remove();
    let destination='';e.t.setNavigate(url=>{destination=url;e.w.history.pushState({},'',url)});e.t.setWait(async fn=>fn());
    assert.equal(await e.t.learnRun(),true);
    assert.equal(destination,'https://ai-smart-course-student-pro.zhihuishu.com/masteryHistory/1000000000000000005/100001/1000000000000000004?mapUid=&catalogActiveTab=personal');
    assert.equal(e.values.get('zhs_learn_navigation_v1').point,'1000000000000000004');
    assert.equal(e.values.get('zhs_learn_entry_v1').method,'history-route');e.close();
  });
  await test('ignored improve click falls back once and counts only one practice attempt',async()=>{
    const e=learnFixture(77);let clicks=0,navigations=0;e.w.document.getElementById('improve').onclick=()=>clicks++;
    e.t.setNavigate(url=>{navigations++;e.w.history.pushState({},'',url)});e.t.setWait(async fn=>fn());
    assert.equal(await e.t.learnRun(),true);assert.equal(clicks,1);assert.equal(navigations,1);
    assert.equal(e.values.get('zhs_learn_navigation_v1').attempts['1000000000000000002'],1);e.close();
  });
  await test('disabled improve control does not trigger navigation or consume an attempt',async()=>{
    const e=learnFixture(77);e.w.document.getElementById('improve').disabled=true;
    e.t.setNavigate(()=>{throw Error('Disabled control must not be bypassed')});e.t.setWait(async fn=>fn());
    assert.equal(await e.t.learnRun(),false);assert.deepEqual(e.values.get('zhs_learn_navigation_v1').attempts,{});e.close();
  });
  await test('improve button rendered after title readiness is found during the short wait',async()=>{
    const e=learnFixture(77),button=e.w.document.getElementById('improve');button.remove();let waiting=false;
    e.t.setWait(async fn=>{let result=fn();if(!result&&!waiting){waiting=true;e.w.document.querySelector('main').appendChild(button);button.onclick=()=>e.w.history.pushState({},'', '/masteryHistory/1000000000000000005/100001/1000000000000000002');result=fn();}return result;});
    e.t.setNavigate(()=>{throw Error('Should use newly rendered button')});assert.equal(await e.t.learnRun(),true);assert.equal(waiting,true);e.close();
  });
  await test('a wrapper around the improve button does not create duplicate action targets',async()=>{
    const e=learnFixture(77),button=e.w.document.getElementById('improve'),wrapper=e.w.document.createElement('div');
    button.replaceWith(wrapper);wrapper.appendChild(button);button.onclick=()=>e.w.history.pushState({},'', '/masteryHistory/1000000000000000005/100001/1000000000000000002');
    e.t.setWait(async fn=>fn());e.t.setNavigate(()=>{throw Error('Wrapper must resolve to the native control')});assert.equal(await e.t.learnRun(),true);e.close();
  });
  await test('stop while waiting for entry prevents direct-route fallback',async()=>{
    const e=learnFixture(77);e.w.document.getElementById('improve').remove();
    e.t.setWait(async fn=>{const value=fn();if(!value)e.w.__ZHS_STOP=true;return value;});
    e.t.setNavigate(()=>{throw Error('No navigation after stop')});assert.equal(await e.t.learnRun(),false);e.close();
  });
  await test('old encoded learning title is migrated while preserving progress and attempts',async()=>{
    const e=learnFixture(44),route=e.t.learnRoute(),encoded=Buffer.from(encodeURIComponent(JSON.stringify('卷积与卷积定理'))).toString('base64');
    e.values.set('zhs_learn_navigation_v1',{...route,title:encoded,phase:'ready',attempts:{[route.point]:1},completed:['previous']});
    e.t.setWait(async fn=>fn());e.w.document.getElementById('improve').onclick=()=>e.w.history.pushState({},'', '/masteryHistory/1000000000000000005/100001/1000000000000000002');
    assert.equal(await e.t.learnRun(),true);const saved=e.values.get('zhs_learn_navigation_v1');
    assert.equal(saved.title,'卷积与卷积定理');assert.equal(saved.attempts[route.point],2);assert.deepEqual(saved.completed,['previous']);e.close();
  });
  await test('learnPage is recognized before generic quiz or AI chat controls',()=>{
    const e=learnFixture(45);assert.equal(e.t.detectScreen(),e.t.SCREENS.LEARN);assert.equal(e.t.learnMastery(),45);
    assert.equal(e.t.reviewPracticeInfo().point,'1000000000000000002');assert.equal(e.t.reviewPracticeInfo().title,'卷积与卷积定理');e.close();
  });
  await test('learning layout export includes catalog but excludes chat text and embedded documents',()=>{
    const e=learnFixture(45);const report=e.t.reviewLayoutDiagnostic();assert.equal(report.page,'learnPage');
    assert(report.catalogHTML.includes('拉普拉斯变换'));assert(!report.catalogHTML.includes('AI学伴'));assert(!report.catalogHTML.includes('<iframe'));e.close();
  });
  await test('catalog scan opens collapsed later module and retains document order',async()=>{
    const e=learnFixture();const scan=await e.t.learnScanCatalog();assert.equal(scan.complete,true);
    assert.deepEqual(Array.from(scan.items,x=>x.title),['傅里叶变换的基本性质','卷积与卷积定理','傅里叶变换综合举例','拉普拉斯变换的概念']);
    assert.equal(e.w.document.querySelector('iframe').contentDocument.body.textContent,'');e.close();
  });
  await test('catalog scan expands both module and nested knowledge-unit levels',async()=>{
    const e=learnFixture();const wrap=e.w.document.querySelector('.el-collapse-item__wrap');
    wrap.innerHTML='<section class="el-collapse-item"><button class="el-collapse-item__header" aria-expanded="false">知识单元：傅里叶变换的性质</button><div style="display:none"><div class="lesson"><span>卷积与卷积定理</span><span>必学</span><span>/1</span></div><div class="lesson"><span>傅里叶变换综合举例</span><span>必学</span><span>/1</span></div></div></section>';
    const unit=wrap.querySelector('button');unit.onclick=()=>{unit.setAttribute('aria-expanded','true');unit.nextElementSibling.style.display='block';};
    const scan=await e.t.learnScanCatalog();assert.equal(scan.complete,true);assert.equal(unit.getAttribute('aria-expanded'),'true');
    assert.deepEqual(Array.from(scan.items,x=>x.title),['卷积与卷积定理','傅里叶变换综合举例','拉普拉斯变换的概念']);e.close();
  });
  await test('learn title works when the central title is a plain group, as in the supplied appshot',async()=>{
    const e=learnFixture();await e.t.learnScanCatalog();const heading=e.w.document.querySelector('h1');const div=e.w.document.createElement('div');div.textContent=heading.textContent;heading.replaceWith(div);
    assert.equal(e.t.learnTitle(),'卷积与卷积定理');e.close();
  });
  await test('inner catalog scrolling discovers a lower lazy-loaded lesson without scrolling the PDF',async()=>{
    const e=learnFixture();const aside=e.w.document.querySelector('aside');let top=400,loaded=false;
    Object.defineProperty(aside,'clientHeight',{value:300});Object.defineProperty(aside,'scrollHeight',{get(){return loaded?1400:1000;}});
    Object.defineProperty(aside,'scrollTop',{get(){return top},set(value){top=value;if(top>=600&&!loaded){loaded=true;aside.lastElementChild.lastElementChild.insertAdjacentHTML('beforeend','<div class="lesson"><span>拉普拉斯变换的性质</span><span>必学</span><span>/1</span></div>');}}});
    const scan=await e.t.learnScanCatalog();assert.equal(scan.complete,true);assert.equal(scan.items.at(-1).title,'拉普拉斯变换的性质');
    assert.equal(e.w.document.documentElement.scrollTop,0);assert(top>=1100);e.close();
  });
  await test('above-threshold learning page selects the following lesson instead of earlier ones',async()=>{
    const e=learnFixture(95);let selected='';for(const row of e.w.document.querySelectorAll('.lesson'))row.onclick=()=>{selected=row.firstElementChild.textContent;e.w.history.pushState({},'', '/learnPage/1000000000000000005/next/100001?catalogActiveTab=personal');};
    e.t.setWait(async fn=>fn());assert.equal(await e.t.learnRun(),true);assert.equal(selected,'傅里叶变换综合举例');
    assert.equal(e.values.get('zhs_learn_navigation_v1').point,'next');e.close();
  });
  await test('learning page below 90 enters practice and preserves its return address',async()=>{
    const e=learnFixture(89);e.w.document.getElementById('improve').onclick=()=>e.w.history.pushState({},'', '/masteryHistory/1000000000000000005/100001/1000000000000000002');
    e.t.setWait(async fn=>fn());assert.equal(await e.t.learnRun(),true);assert.equal(e.t.learnReturnUrl(),learnUrl);
    assert.equal(e.values.get('zhs_learn_navigation_v1').attempts['1000000000000000002'],1);e.close();
  });
  await test('above-threshold mastery advances even with an old pending reference flag',async()=>{
    const e=learnFixture(99);e.values.set('zhs_review_pending_v1',true);let entered=0;
    e.w.document.getElementById('improve').onclick=()=>{entered++;e.w.history.pushState({},'', '/masteryHistory/1000000000000000005/100001/1000000000000000002');};
    let selected='';for(const row of e.w.document.querySelectorAll('.lesson'))row.onclick=()=>{selected=row.firstElementChild.textContent;e.w.history.pushState({},'', '/learnPage/1000000000000000005/next/100001');};
    e.t.setWait(async fn=>fn());assert.equal(await e.t.learnRun(),true);assert.equal(entered,0);assert.equal(selected,'傅里叶变换综合举例');assert.equal(e.values.get('zhs_review_pending_v1'),false);e.close();
  });
  await test('fill-marked learning point advances even with low mastery',async()=>{
    const e=learnFixture(45);e.values.set('zhs_fill_skip_v1',{x:{listUrl:e.t.learnRoute().listUrl,point:'1000000000000000002',title:'卷积与卷积定理'}});
    let target='';for(const row of e.w.document.querySelectorAll('.lesson'))row.onclick=()=>{target=row.firstElementChild.textContent;e.w.history.pushState({},'', '/learnPage/1000000000000000005/next/100001');};
    e.t.setWait(async fn=>fn());assert.equal(await e.t.learnRun(),true);assert.equal(target,'傅里叶变换综合举例');e.close();
  });
  await test('reaching the last catalog lesson ends instead of wrapping to Fourier',async()=>{
    const e=learnFixture(95);e.w.document.querySelector('h1').textContent='拉普拉斯变换的概念';e.t.setWait(async fn=>fn());
    let clicked=0;for(const row of e.w.document.querySelectorAll('.lesson'))row.onclick=()=>clicked++;
    assert.equal(await e.t.learnRun(),true);assert.equal(clicked,0);assert.equal(e.values.get('zhs_loop'),0);e.close();
  });
  await test('stop during catalog expansion prevents selecting another lesson',async()=>{
    const e=learnFixture(95);let clicked=0;for(const row of e.w.document.querySelectorAll('.lesson'))row.onclick=()=>clicked++;
    e.t.setSleep(async()=>{e.w.__ZHS_STOP=true;});e.t.setWait(async fn=>fn());assert.equal(await e.t.learnRun(),false);assert.equal(clicked,0);e.close();
  });
  await test('learning navigation waits for the destination title before using its mastery',async()=>{
    const e=learnFixture(99);const route=e.t.learnRoute();e.values.set('zhs_learn_navigation_v1',{...route,title:'傅里叶变换综合举例',phase:'ready',attempts:{},completed:[]});
    let entered=0,waited=false;e.w.document.getElementById('improve').onclick=()=>{entered++;e.w.history.pushState({},'', '/masteryHistory/1000000000000000005/100001/1000000000000000002');};
    e.t.setWait(async fn=>{if(!waited){assert.equal(!!fn(),false);waited=true;e.w.document.querySelector('h1').textContent='傅里叶变换综合举例';e.w.document.querySelector('#mastery span').textContent='30%';}return fn();});
    assert.equal(await e.t.learnRun(),true);assert.equal(entered,1);e.close();
  });
  await test('failed expansion does not report the catalog complete or skip an unseen module',async()=>{
    const e=learnFixture(95);e.w.document.querySelectorAll('.el-collapse-item__header')[1].onclick=()=>{};
    assert.equal((await e.t.learnScanCatalog()).complete,false);e.close();
  });
  await test('fill skip returns to the saved learning page for catalog continuation',async()=>{
    const title=Buffer.from(encodeURIComponent(JSON.stringify('卷积与卷积定理'))).toString('base64');
    const e=env('<span>填空题</span>',`https://studentexamcomh5.zhihuishu.com/studentReviewTestOrExam/1/1/1/1000000000000000005/${title}/1?classId=100001&pointId=1000000000000000002`);
    e.values.set('zhs_learn_navigation_v1',{...e.t.learnRoute(learnUrl),phase:'practice',title:'卷积与卷积定理',attempts:{},completed:[]});
    let destination='';e.t.setNavigate(url=>destination=url);e.t.setWait(async()=>true);
    assert.equal(await e.t.reviewSkipFill(),true);assert.equal(destination,learnUrl);e.close();
  });
  await test('completed review returns from history to learning page before any further practice',async()=>{
    const e=env('<button>去提升</button><button>查看解析</button>','https://ai-smart-course-student-pro.zhihuishu.com/masteryHistory/1000000000000000005/100001/1000000000000000002');
    e.values.set('zhs_learn_navigation_v1',{...e.t.learnRoute(learnUrl),title:'卷积与卷积定理',phase:'ready',attempts:{},completed:[]});
    let destination='',clicks=0;e.w.document.addEventListener('click',()=>clicks++);e.t.setNavigate(url=>destination=url);e.t.setWait(async()=>true);
    assert.equal(await e.t.reviewRunHistory(),true);assert.equal(destination,learnUrl);assert.equal(clicks,0);e.close();
  });
  function forwardList() {
    const e=env('<main>'+[['前章低分',10],['起点',89],['已达标',91],['后续低分',30]].map(([title,pct])=>`<article><h3>${title}</h3><div class="el-progress--dashboard">${pct}%</div></article>`).join('')+'</main>','https://ai-smart-course-student-pro.zhihuishu.com/singleCourse/knowledgeStudy/99/22');
    const rows=[...e.w.document.querySelectorAll('.el-progress--dashboard')];rows.forEach(el=>Object.defineProperty(el,'innerText',{get(){return this.textContent}}));
    e.values.set('zhs_forward_sequence_v1',{listUrl:e.w.location.href,anchor:{title:'起点'},queue:null,position:0,attempts:{}});return {e,rows};
  }
  await test('forward queue begins at chosen point, skips >=90 and never loops to earlier low scores',()=>{
    const {e,rows}=forwardList();assert.equal(e.t.findLowPctProgress(true),rows[1]); // A point below 90 remains eligible.
    rows[1].textContent='91%';assert.equal(e.t.findLowPctProgress(true),rows[3]);
    rows[3].textContent='100%';assert.equal(e.t.findLowPctProgress(),null);assert.equal(e.t.findLowPctProgress(),null);
    assert.equal(e.values.get('zhs_forward_sequence_v1').position,3);e.close();
  });
  await test('persisted forward order is retained even when DOM rows reorder',()=>{
    const {e,rows}=forwardList();e.t.findLowPctProgress(true);rows[1].textContent='95%';
    const stored=JSON.parse(JSON.stringify(e.values.get('zhs_forward_sequence_v1')));
    e.w.document.querySelector('main').prepend(rows[3].parentElement);e.values.set('zhs_forward_sequence_v1',stored);
    assert.equal(e.t.findLowPctProgress(true),rows[3]);assert.notEqual(e.t.findLowPctProgress(),rows[0]);e.close();
  });
  await test('fill-marked current point advances within the same forward queue',()=>{
    const {e,rows}=forwardList();e.values.set('zhs_fill_skip_v1',{skip:{listUrl:e.w.location.href,title:'起点'}});
    assert.equal(e.t.findLowPctProgress(),rows[3]);assert.equal(e.values.get('zhs_forward_sequence_v1').position,2);e.close();
  });
  await test('four unsuccessful attempts advance without ever wrapping backward',()=>{
    const {e,rows}=forwardList();for(let i=0;i<4;i++)assert.equal(e.t.findLowPctProgress(true),rows[1]);
    assert.equal(e.t.findLowPctProgress(true),rows[3]);e.close();
  });
  await test('missing starting point never silently resets to first low score',()=>{
    const {e}=forwardList();e.values.get('zhs_forward_sequence_v1').anchor.title='未展开的知识点';
    assert.equal(e.t.findLowPctProgress(),null);e.close();
  });
  await test('explicit start in an exercise seeds the decoded current point instead of stale list context',()=>{
    const title=Buffer.from(encodeURIComponent(JSON.stringify('用户新起点'))).toString('base64');
    const e=env('',`https://studentexamcomh5.zhihuishu.com/studentReviewTestOrExam/1/1/1/99/${title}/1?classId=22&pointId=33`);
    e.values.set('zhs_list_context_v1',{listUrl:'https://ai-smart-course-student-pro.zhihuishu.com/singleCourse/knowledgeStudy/99/22',rowText:'旧知识点'});
    e.t.reviewSequenceSeed();assert.equal(e.values.get('zhs_forward_sequence_v1').anchor.title,'用户新起点');e.close();
  });
  await test('duplicate broken formula options produce a precise error without AI or stale-change retry',async()=>{
    const e=env(card('场强选项',['$$\\vec{E} =','$$\\vec{E} = -','$$\\vec{E} =','无关'],null));
    e.t.setAI(()=>{throw Error('No AI on indistinguishable options')});
    await assert.rejects(e.t.answerWithAI([]),/无法区分的选项/);
    assert.equal(e.values.get('zhs_question_change_v1').reason,'unreadable-or-duplicate-options');e.close();
  });
  await test('hidden earlier chapter is excluded from low mastery selection',()=>{
    const e=env('<div hidden><div class="el-progress--dashboard">0%</div></div><article><h3>当前章知识点</h3><div class="el-progress--dashboard">40%</div></article>','https://ai-smart-course-student-pro.zhihuishu.com/singleCourse/knowledgeStudy/99/22?chapterId=2');
    const nodes=[...e.w.document.querySelectorAll('.el-progress--dashboard')];nodes.forEach(el=>Object.defineProperty(el,'innerText',{get(){return this.textContent}}));
    assert.equal(e.t.findLowPctProgress(true),nodes[1]);assert.equal(e.values.get('zhs_list_context_v1').returnUrl,e.w.location.href);e.close();
  });
  await test('fill skip returns to full saved chapter URL including query and hash',async()=>{
    const list='https://ai-smart-course-student-pro.zhihuishu.com/singleCourse/knowledgeStudy/99/22';
    const e=env('<span>填空题</span>','https://ai-smart-course-student-pro.zhihuishu.com/examPreview/99/10/11/33/22?nodeName=当前知识点');
    const returnUrl=list+'?chapterId=2&catalogActiveTab=personal#section2';
    e.values.set('zhs_list_context_v1',{listUrl:list,returnUrl,rowText:'当前知识点',time:Date.now()});
    let destination;e.t.setNavigate(url=>destination=url);e.t.setWait(async()=>true);
    assert.equal(await e.t.reviewSkipFill(),true);assert.equal(destination,returnUrl);e.close();
  });
  await test('list hop clicks only its chosen row when the list rerenders',async()=>{
    const e=env('<main><article><h3>第一知识点</h3><div class="el-progress--dashboard">20%</div></article><article><h3>第二知识点</h3><div class="el-progress--dashboard">30%</div></article></main>','https://ai-smart-course-student-pro.zhihuishu.com/singleCourse/knowledgeStudy/99/22');
    let clicks=0;for(const el of e.w.document.querySelectorAll('.el-progress--dashboard')){Object.defineProperty(el,'innerText',{get(){return this.textContent}});el.onclick=()=>{clicks++;el.parentElement.remove()};}
    e.values.set('zhs_loop',Date.now()+60000);e.t.setWait(async()=>true);
    assert.equal(await e.t.runListHop(),true);assert.equal(clicks,1);e.close();
  });
  await test('late question render is reread before reusing a reference and never sent stale to AI',async()=>{
    const e=env(card('新题<img src="https://example.com/f.png">'));e.t.reviewCollectVisible();
    const q=e.w.document.querySelector('.questionContent');q.firstChild.nodeValue='旧题';let reads=0;
    e.t.setImageFetcher(async()=>{q.firstChild.nodeValue='新题';return 'pixels-v1:test'});
    e.t.setReader(async()=>{reads++;return []});e.t.setAI(()=>{throw Error('Should use newly matched reference')});
    for(const opt of e.w.document.querySelectorAll('li'))opt.onclick=()=>opt.classList.add('is-checked');
    assert.equal(await e.t.answerWithAI([]),'B');assert.equal(reads,1);assert.equal(e.t.reviewAuditReport().stats.hits,1);e.close();
  });
  await test('continuously changing question stops after two rereads without applying an answer',async()=>{
    const e=env(card(undefined,undefined,null));let reads=0,clicks=0;
    e.t.setPrepare(async snap=>{e.w.document.querySelector('.questionContent').textContent+='变';return snap});
    e.t.setReader(async()=>{reads++;return []});e.t.setAI(()=>{throw Error('Must not call AI')});
    e.w.document.addEventListener('click',()=>clicks++);
    await assert.rejects(e.t.answerWithAI([]),/持续变化/);assert.equal(reads,2);assert.equal(clicks,0);
    assert.equal(e.t.reviewAuditReport().questionChange.attempt,2);e.close();
  });
  await test('route change during reference preparation stops without retrying another chapter',async()=>{
    const e=env(card(undefined,undefined,null));let reads=0;
    e.t.setPrepare(async snap=>{e.w.history.pushState({},'', '/practice/another');return snap});e.t.setReader(async()=>{reads++;return []});
    await assert.rejects(e.t.answerWithAI([]),/页面已切换/);assert.equal(reads,0);e.close();
  });
  await test('objective-fill label and synthetic URL mark the point then resume list selection',async()=>{
    const url='https://studentexamcomh5.zhihuishu.com/studentReviewTestOrExam/200001/1/1/1000000000000000005/JTIyJUU1JUJEJUEyJUU1JUE2JTgyJUU4JUEyJUFCJUU3JUE3JUFGJUU1JTg3JUJEJUU2JTk1JUIwJUU0JUI4JUJBeCVFNyU5QSU4NCVFNiU5QyU4OSVFNyU5MCU4NiVFNSU4NyVCRCVFNiU5NSVCMCVFNyU5QSU4NCVFNyVBNyVBRiVFNSU4OCU4NiUyMg==/1/true/true/true/1?mapUid=&foAiRun=1&point=1&classId=100001&pointId=1000000000000000001&paperId=300001&examPaperId=300001&reviewQ=2';
    const title='形如被积函数为x的有理函数的积分';
    const e=env('<header>'+title+'</header><div>1. <strong>填空客观题</strong>（自动批阅）</div><div class="questionContent"><img src="https://example.com/formula.png">___.</div><ul><li>(1)<input type="text"></li></ul><button class="reviewDone ZHIHUISHU_QZMD">提交作业</button>',url);
    assert.equal(e.t.reviewHasFill(),true);
    assert.equal(e.t.detectScreen(),e.t.SCREENS.QUIZ);
    assert.equal(e.t.reviewPracticeInfo().title,title);
    let destination='',submits=0;e.w.document.querySelector('button').onclick=()=>submits++;
    e.t.setAI(()=>{throw Error('Must skip without AI')});e.t.setNavigate(value=>destination=value);e.t.setWait(async()=>true);
    assert.equal(await e.t.runQuizHop(),true);assert.equal(submits,0);
    assert.equal(destination,'https://ai-smart-course-student-pro.zhihuishu.com/singleCourse/knowledgeStudy/1000000000000000005/100001');
    const saved=e.values.get('zhs_fill_skip_v1');assert.equal(Object.values(saved)[0].point,'1000000000000000001');e.close();
    const next=env(`<main><article><h3>${title}</h3><div class="el-progress--dashboard">20%</div></article><article><h3>下一知识点</h3><div class="el-progress--dashboard">30%</div></article></main>`,destination);
    next.values.set('zhs_fill_skip_v1',saved);const progress=[...next.w.document.querySelectorAll('.el-progress--dashboard')];
    progress.forEach(el=>Object.defineProperty(el,'innerText',{get(){return this.textContent}}));
    assert.equal(next.t.findLowPctProgress(true),progress[1]);assert.equal(next.w.document.querySelector('[data-zhs-skip-label]').textContent,'含填空题 · 已跳过');next.close();
  });
  await test('fill labels accept objective subjective grading and whitespace variants',()=>{
    for(const label of ['2、填空主观题（人工批阅）','3. 填空题 (自动批阅)','填空客观题（2分）','1. 填空客观题\n（自动批阅）']) {
      const e=env(`<div>${label}</div>`);assert.equal(e.t.reviewHasFill(),true,label);e.close();
    }
  });
  await test('objective-fill name inside choice or prose is not treated as question type',()=>{
    for(const html of [card('请选择题型',['填空客观题（自动批阅）','单选题'],null),'<p>填空客观题（自动批阅）应如何设置评分？</p>', '<div hidden>1. 填空客观题（自动批阅）</div>']) {
      const e=env(html);assert.equal(e.t.reviewHasFill(),false);e.close();
    }
  });
  await test('fill type label skips entire exercise before any AI call or submit',async()=>{
    const title=Buffer.from(encodeURIComponent(JSON.stringify('填空知识点'))).toString('base64');
    const e=env('<div>1. 填空题</div><div class="questionContent">求值：<input></div><button class="reviewDone ZHIHUISHU_QZMD">提交作业</button>',`https://studentexamcomh5.zhihuishu.com/studentReviewTestOrExam/1/1/1/99/${title}/1?classId=22&pointId=33`);
    let submitted=0,destination='';e.w.document.querySelector('button').onclick=()=>submitted++;
    e.t.setAI(()=>{throw Error('AI must not run')});e.t.setNavigate(url=>destination=url);e.t.setWait(async()=>true);
    assert.equal(await e.t.runQuizHop(),true);assert.equal(submitted,0);
    assert.equal(destination,'https://ai-smart-course-student-pro.zhihuishu.com/singleCourse/knowledgeStudy/99/22');
    const records=e.values.get('zhs_fill_skip_v1');assert.equal(Object.values(records)[0].title,'填空知识点');assert.equal(e.values.get('zhs_review_pending_v1'),false);
    e.close();
  });
  await test('fill mention in choice text and uploader cannot mark a choice exercise',()=>{
    const e=env(card('请选择题型',['填空题','单选题'],null)+'<div class="upload"><textarea></textarea></div>');
    assert.equal(e.t.reviewHasFill(),false);e.close();
  });
  await test('hidden fill label does not skip currently visible choice question',()=>{
    const e=env('<div hidden><span>填空题</span></div>'+card(undefined,undefined,null));assert.equal(e.t.reviewHasFill(),false);e.close();
  });
  await test('skip markings survive list reordering and next eligible point is selected',()=>{
    const url='https://ai-smart-course-student-pro.zhihuishu.com/singleCourse/knowledgeStudy/99/22';
    const e=env('<main><article><h3>普通知识点</h3><div class="el-progress--dashboard">20%</div></article><article><h3>填空知识点</h3><div class="el-progress--dashboard">10%</div></article></main>',url);
    const dashboards=[...e.w.document.querySelectorAll('.el-progress--dashboard')];dashboards.forEach(x=>Object.defineProperty(x,'innerText',{get(){return this.textContent}}));
    e.values.set('zhs_fill_skip_v1',{point:{listUrl:url,title:'填空知识点',reason:'含填空题'}});
    assert.equal(e.t.reviewSkipFor(dashboards[1]),true);assert.equal(e.t.reviewSkipFor(dashboards[0]),false);
    e.w.document.querySelector('main').prepend(dashboards[1].parentElement);
    assert.equal(e.t.findLowPctProgress(),dashboards[0]);assert.equal(e.w.document.querySelectorAll('[data-zhs-skip-label]').length,1);
    e.values.set('zhs_fill_skip_v1',{point:{listUrl:url.replace('/99/','/100/'),title:'填空知识点'}});assert.equal(e.t.reviewSkipFor(dashboards[1]),false);e.close();
  });
  await test('all marked points stop list work instead of reentering them',()=>{
    const url='https://ai-smart-course-student-pro.zhihuishu.com/singleCourse/knowledgeStudy/99/22';
    const e=env('<main><article><h3>填空知识点</h3><div class="el-progress--dashboard">10%</div></article></main>',url);
    e.values.set('zhs_fill_skip_v1',{point:{listUrl:url,title:'填空知识点'}});assert.equal(e.t.findLowPctProgress(),null);e.close();
  });
  await test('unknown exercise identity stops without navigating to an invented course',async()=>{
    const e=env('<span>填空题</span>');let nav=0;e.t.setNavigate(()=>nav++);assert.equal(await e.t.reviewSkipFill(),false);assert.equal(nav,0);e.close();
  });
  await test('review page with fill label skips rather than requiring choice references',async()=>{
    const e=env('<span>填空题</span>','https://ai-smart-course-student-pro.zhihuishu.com/examPreview/99/10/11/33/22?nodeName=填空知识点');
    let nav=0;e.t.setNavigate(()=>nav++);e.t.setWait(async()=>true);assert.equal(await e.t.reviewRunPage(),true);assert.equal(nav,1);e.close();
  });
  await test('checkIcon glyph-only selection is detected without altering option identity',async()=>{
    const e=env(card('字体图标题',['x','y','z'],null));const opts=[...e.w.document.querySelectorAll('li')];
    opts.forEach(opt=>opt.insertAdjacentHTML('afterbegin','<i class="checkIcon fl iconfont">&#xe600;</i>'));
    const initial=snapshot(e);let clicks=0;
    opts[0].addEventListener('click',()=>{clicks++;opts[0].querySelector('i').textContent='\ue601'});
    const result=await e.t.reviewApplyLetters('A',opts,false);
    assert.equal(result.letters,'A');assert.equal(snapshot(e).key,initial.key);
    await e.t.reviewApplyLetters('A',opts,false);assert.equal(clicks,1);e.close();
  });
  await test('single-choice retries child control when row click is ignored',async()=>{
    const e=env(card(undefined,undefined,null));const opts=[...e.w.document.querySelectorAll('li')];
    opts[0].insertAdjacentHTML('afterbegin','<i class="checkIcon fl iconfont">&#xe600;</i>');let clicks=0;
    opts[0].querySelector('i').addEventListener('click',()=>{clicks++;opts[0].querySelector('i').textContent='\ue601'});
    e.t.setWait(async fn=>fn());const result=await e.t.reviewApplyLetters('A',opts,false);
    assert.equal(result.letters,'A');assert.equal(clicks,1);e.close();
  });
  await test('unconfirmed glyph clicks stop and retain both attempts in diagnostic',async()=>{
    const e=env(card(undefined,undefined,null));const opts=[...e.w.document.querySelectorAll('li')];
    opts.forEach(opt=>opt.insertAdjacentHTML('afterbegin','<i class="checkIcon fl iconfont">&#xe600;</i>'));
    e.t.setWait(async fn=>fn());await assert.rejects(e.t.reviewApplyLetters('A',opts,false),/状态未确认/);
    const report=e.values.get('zhs_last_selection_debug_v1');assert.equal(report.attempts.length,2);
    assert.equal(report.attempts[1].confirmed,false);assert(JSON.stringify(report).includes('\ue600'));e.close();
  });
  await test('stop during confirmation prevents retrying single-choice control',async()=>{
    const e=env(card(undefined,undefined,null));const opts=[...e.w.document.querySelectorAll('li')];let clicks=0;
    opts[0].addEventListener('click',()=>clicks++);e.t.setWait(async()=>{e.w.__ZHS_STOP=true;return false});
    await assert.rejects(e.t.reviewApplyLetters('A',opts,false),/已停止/);assert.equal(clicks,1);e.close();
  });
  await test('original unreviewed guesses are never cached',()=>{const e=env(card(undefined,undefined,null));assert.equal(e.t.reviewLookup(snapshot(e)),null);assert.equal(e.t.reviewCollectVisible().saved,0);e.close()});
  await test('published answer wins over my answer',()=>{const e=env(card());assert.equal(e.t.reviewCollectVisible().saved,1);assert.equal(e.t.reviewLookup(snapshot(e)),'B');e.close()});
  await test('reordered options remap to new letter',()=>{const e=env(card());e.t.reviewCollectVisible();e.w.document.body.innerHTML=card(undefined,['2πi','1','0'],null);assert.equal(e.t.reviewLookup(snapshot(e)),'A');e.close()});
  await test('new distractor changes question identity',()=>{const e=env(card());e.t.reviewCollectVisible();e.w.document.body.innerHTML=card(undefined,['0','2πi','-1'],null);assert.equal(e.t.reviewLookup(snapshot(e)),null);e.close()});
  await test('mathematical minus sign remains significant',()=>{const e=env(card('求 z-1'));e.t.reviewCollectVisible();e.w.document.body.innerHTML=card('求 z+1',undefined,null);assert.equal(e.t.reviewLookup(snapshot(e)),null);e.close()});
  await test('variable case remains significant',()=>{const e=env(card('求 z'));e.t.reviewCollectVisible();e.w.document.body.innerHTML=card('求 Z',undefined,null);assert.equal(e.t.reviewLookup(snapshot(e)),null);e.close()});
  await test('formula image identity remains significant',()=>{const e=env(card('<img src="https://example.com/a.png">'));e.t.reviewCollectVisible();e.w.document.body.innerHTML=card('<img src="https://example.com/b.png">',undefined,null);assert.equal(e.t.reviewLookup(snapshot(e)),null);e.close()});
  await test('duplicate option contents refuse caching',()=>{const e=env(card(undefined,['x','x']));assert.equal(snapshot(e),null);assert.equal(e.t.reviewCollectVisible().saved,0);e.close()});
  await test('conflicting published answers disable reuse',()=>{const e=env(card());const s=snapshot(e);assert.equal(e.t.reviewSave(s,['B']),true);assert.equal(e.t.reviewSave(s,['C']),false);assert.equal(e.t.reviewLookup(s),null);assert.equal(e.t.reviewSave(s,['B']),false);e.close()});
  await test('explicit answer parser handles delimiters and rejects explanations',()=>{const e=env();const p=e.t.reviewParsePublished;
    assert.equal(p('我的答案：A',4,false),null);
    assert.equal(p('正确答案：A，C',4,false),null);
    assert.equal(p('正确答案：Z',4,false),null);
    assert.equal(p('正确答案：D',3,false),null);
    assert.equal(p('正确答案：A因为',4,false),null);
    assert.equal(p('正确答案：ABCD说明',4,true),null);
    assert.equal(Array.from(p('参考答案：A、C',4,true)).join(''),'AC');
    assert.equal(Array.from(p('正确答案：B 我的答案：C',4,false)).join(''),'B');e.close()});
  await test('multi-card reviews never mix question answers',()=>{const e=env(card('第一题',undefined,'A')+card('第二题',undefined,'C'));const x=e.t.reviewCollectVisible();assert.equal(x.saved,2);const vals=Object.values(e.t.reviewReadStore());assert.equal(vals.length,2);assert.notEqual(vals[0].answers[0],vals[1].answers[0]);e.close()});
  await test('answer belonging to another card is not borrowed',()=>{const e=env(card('第一题',undefined,null)+card('第二题',undefined,'C'));assert.equal(e.t.reviewCollectVisible().saved,1);assert.equal(e.t.reviewLookup(snapshot(e)),null);e.close()});
  await test('answer-like wording inside stem is not review metadata',()=>{const e=env(card('正确答案：A',undefined,null));assert.equal(e.t.reviewIsPage(),false);assert.equal(e.t.reviewCollectVisible().saved,0);e.close()});
  await test('history recognized before generic practice controls',()=>{const e=env('<button class="improve-btn">去提升</button>','https://ai-smart-course-student-pro.zhihuishu.com/masteryHistory/1');assert.equal(e.t.detectScreen(),e.t.SCREENS.HISTORY);e.close()});
  await test('unreadable answer on a review route cannot trigger AI answering',()=>{const e=env(card(undefined,undefined,null),'https://ai-smart-course-student-pro.zhihuishu.com/analysis/1');assert.equal(e.t.detectScreen(),e.t.SCREENS.REVIEW);e.close()});
  await test('recognized review label cannot trigger AI answering',()=>{const e=env(card());assert.equal(e.t.detectScreen(),e.t.SCREENS.REVIEW);e.close()});
  await test('multi-select clears stale wrong choices and selects exact remembered set',async()=>{const e=env(card('多选题',['x','y','z'],null,true));const opts=[...e.w.document.querySelectorAll('.el-checkbox')];opts[1].classList.add('is-checked');for(const opt of opts) opt.addEventListener('click',()=>opt.classList.toggle('is-checked'));await e.t.reviewApplyLetters('AC',opts,true);assert.deepEqual(opts.map(x=>x.classList.contains('is-checked')),[true,false,true]);e.close()});
  await test('cache hit bypasses AI request and chooses remapped option',async()=>{const e=env(card());e.t.reviewCollectVisible();e.w.document.body.innerHTML=card(undefined,['2πi','0','1'],null);e.t.setAI(()=>{throw new Error('AI must not be called')});for(const opt of e.w.document.querySelectorAll('li'))opt.addEventListener('click',()=>opt.classList.add('is-checked'));assert.equal(await e.t.answerWithAI([]),'A');assert.equal(e.w.document.querySelector('li').classList.contains('is-checked'),true);e.close()});
  await test('stop while AI is running prevents later option clicks',async()=>{const e=env(card(undefined,undefined,null));let clicks=0;for(const opt of e.w.document.querySelectorAll('li')){Object.defineProperty(opt,'innerText',{get(){return this.textContent}});opt.addEventListener('click',()=>clicks++)}e.t.setAI(async()=>{e.w.__ZHS_STOP=true;return {raw:'B'}});await assert.rejects(e.t.answerWithAI([]),/已停止/);assert.equal(clicks,0);e.close()});
  await test('changed options during AI wait cannot receive stale answer',async()=>{const e=env(card(undefined,undefined,null));for(const opt of e.w.document.querySelectorAll('li'))Object.defineProperty(opt,'innerText',{get(){return this.textContent}});e.t.setAI(async()=>{e.w.document.querySelectorAll('li')[1].lastChild.textContent='changed';return {raw:'B'}});await assert.rejects(e.t.answerWithAI([]),/发生变化/);e.close()});
  await test('review cache persists when a new page context is created',()=>{const a=env(card());a.t.reviewCollectVisible();const saved=JSON.parse(JSON.stringify(a.values.get('zhs_review_memory_v1')));a.close();const b=env(card(undefined,undefined,null));b.values.set('zhs_review_memory_v1',saved);assert.equal(b.t.reviewLookup(snapshot(b)),'B');b.close()});
  await test('whole-page review saves all cards without clicking question navigation',async()=>{const e=env(card('题一',undefined,'A')+card('题二',undefined,'B')+card('题三',undefined,'C')+'<button>下一题</button>');let clicks=0;e.w.document.addEventListener('click',()=>clicks++);e.t.setWait(async fn=>{for(let i=0;i<4;i++){const x=fn();if(x)return x}return null});assert.equal(await e.t.reviewRunPage(),true);assert.equal(Object.keys(e.t.reviewReadStore()).length,3);assert.equal(clicks,0);assert.equal(e.values.get('zhs_review_pending_v1'),false);e.close()});
  await test('partly unreadable whole-page review does not mark the attempt learned',async()=>{const e=env(card('题一',undefined,'A')+card('题二',undefined,null));e.values.set('zhs_review_pending_v1',true);e.t.setWait(async fn=>{for(let i=0;i<4;i++){const x=fn();if(x)return x}return null});assert.equal(await e.t.reviewRunPage(),false);assert.equal(Object.keys(e.t.reviewReadStore()).length,1);assert.equal(e.values.get('zhs_review_pending_v1'),true);e.close()});
  await test('hidden stale cards cannot be used as current review data',()=>{const e=env('<div style="display:none">'+card('隐藏题')+'</div>'+card('当前题'));assert.equal(e.t.reviewCollectVisible().saved,1);assert.equal(Object.keys(e.t.reviewReadStore()).length,1);e.close()});
  await test('a new attempt is not confused with an older reviewed history',async()=>{const e=env('<div><button>查看解析</button><span>2026-10-28 19:02:57</span></div><button>去提升 →</button>','https://ai-smart-course-student-pro.zhihuishu.com/masteryHistory/1');let clicked='';e.t.setClick(el=>{clicked=el.textContent;e.w.history.pushState({},'', '/analysis/1')});e.t.setWait(async fn=>fn());assert.equal(await e.t.reviewRunHistory(),true);assert.equal(clicked,'查看解析');assert.equal(e.values.get('zhs_review_return_v1'),'https://ai-smart-course-student-pro.zhihuishu.com/masteryHistory/1');e.close()});
  await test('first practice with explicit empty history enters practice instead of stopping',async()=>{
    const e=env('<h2>掌握度历史记录</h2><div><p>暂无数据</p></div><button>去提升 →</button>','https://ai-smart-course-student-pro.zhihuishu.com/masteryHistory/2');
    let clicks=0;
    e.w.document.querySelector('button').addEventListener('click',()=>{clicks++;e.w.history.pushState({},'', '/practice/2')});
    e.t.setWait(async fn=>{for(let i=0;i<4;i++){const x=fn();if(x)return x}return null});
    assert.equal(await e.t.reviewRunHistory(),true);assert.equal(clicks,1);assert.equal(e.w.location.pathname,'/practice/2');
    assert.equal(e.values.has('zhs_review_history_done_v1'),false);e.close();
  });
  await test('pending review from a previous knowledge point cannot block empty history',async()=>{
    const e=env('<div>暂无数据</div><button>去提升 →</button>','https://ai-smart-course-student-pro.zhihuishu.com/masteryHistory/3');
    e.values.set('zhs_review_pending_v1',true);e.values.set('zhs_review_return_v1','https://ai-smart-course-student-pro.zhihuishu.com/masteryHistory/old');e.values.set('zhs_review_history_open_v1','old');
    e.t.setClick(()=>e.w.history.pushState({},'', '/practice/3'));
    e.t.setWait(async fn=>{for(let i=0;i<4;i++){const x=fn();if(x)return x}return null});
    assert.equal(await e.t.reviewRunHistory(),true);assert.equal(e.values.get('zhs_review_pending_v1'),true);assert.equal(e.values.get('zhs_review_return_v1'),'');assert.equal(e.values.get('zhs_review_history_open_v1'),'');e.close();
  });
  await test('loading placeholder is not mistaken for confirmed empty history',()=>{
    const e=env('<div class="el-loading-spinner"></div><div>暂无数据</div><button>去提升 →</button>');assert.equal(e.t.reviewHistoryState(),null);e.close();
  });
  await test('available review entry takes priority over an empty placeholder',()=>{
    const e=env('<div>暂无数据</div><button>查看解析</button><button>去提升 →</button>');assert.equal(e.t.reviewHistoryState().button.textContent,'查看解析');e.close();
  });
  await test('missing review entry without confirmed empty history does not silently skip review',async()=>{
    const e=env('<div>练习历史</div><button>去提升 →</button>','https://ai-smart-course-student-pro.zhihuishu.com/masteryHistory/4');let clicks=0;e.t.setClick(()=>clicks++);e.t.setWait(async fn=>fn());assert.equal(await e.t.reviewRunHistory(),false);assert.equal(clicks,0);e.close();
  });
  await test('late arriving history replaces transient empty state before any practice click',async()=>{
    const e=env('<div>暂无数据</div><button>去提升 →</button>','https://ai-smart-course-student-pro.zhihuishu.com/masteryHistory/5');let clicked='';
    e.t.setClick(el=>{clicked=el.textContent;e.w.history.pushState({},'', '/analysis/5')});
    let firstWait=true;
    e.t.setWait(async fn=>{if(firstWait){firstWait=false;assert.equal(fn(),null);e.w.document.body.innerHTML='<div><button>查看解析</button><span>2026-10-28 19:22:17</span></div><button>去提升 →</button>';}return fn()});
    assert.equal(await e.t.reviewRunHistory(),true);assert.equal(clicked,'查看解析');e.close();
  });
  await test('already selected nested radio indicator does not require another click',async()=>{
    const e=env(card(undefined,undefined,null));const opts=[...e.w.document.querySelectorAll('li')];opts[1].insertAdjacentHTML('afterbegin','<i class="radio-icon radio-selected"></i>');let clicks=0;opts[1].addEventListener('click',()=>clicks++);
    await e.t.reviewApplyLetters('B',opts,false);assert.equal(clicks,0);e.close();
  });
  await test('single-choice child active state is recognized without changing the li class',async()=>{
    const e=env(card(undefined,undefined,null));const opts=[...e.w.document.querySelectorAll('li')];opts[1].insertAdjacentHTML('afterbegin','<i class="radio-icon"></i>');opts[1].addEventListener('click',()=>opts[1].querySelector('i').classList.add('active'));
    await e.t.reviewApplyLetters('B',opts,false);assert.equal(opts[1].className,'');assert.equal(e.t.reviewOptionState(opts[1]).selected,true);e.close();
  });
  await test('root aria-checked state is recognized on repeated starts',async()=>{
    const e=env(card(undefined,undefined,null));const opts=[...e.w.document.querySelectorAll('li')];opts[1].setAttribute('aria-checked','true');let clicks=0;opts[1].addEventListener('click',()=>clicks++);
    await e.t.reviewApplyLetters('B',opts,false);await e.t.reviewApplyLetters('B',opts,false);assert.equal(clicks,0);e.close();
  });
  await test('radio native checked property is read even without a checked attribute',async()=>{
    const e=env(card(undefined,undefined,null));const opts=[...e.w.document.querySelectorAll('li')];opts[1].insertAdjacentHTML('afterbegin','<input type="radio">');opts[1].querySelector('input').checked=true;let clicks=0;opts[1].addEventListener('click',()=>clicks++);
    await e.t.reviewApplyLetters('B',opts,false);assert.equal(clicks,0);e.close();
  });
  await test('custom marker change confirms selection once and survives repeated starts',async()=>{
    const e=env(card(undefined,undefined,null));const opts=[...e.w.document.querySelectorAll('li')];opts[1].insertAdjacentHTML('afterbegin','<i class="icon custom-empty"></i>');let clicks=0;opts[1].addEventListener('click',()=>{clicks++;opts[1].querySelector('i').className='icon custom-filled'});
    await e.t.reviewApplyLetters('B',opts,false);await e.t.reviewApplyLetters('B',opts,false);assert.equal(clicks,1);assert.equal(e.t.reviewOptionState(opts[1]).selected,true);e.close();
  });
  await test('Vue replacement of an option is verified using its new DOM node',async()=>{
    const e=env(card(undefined,undefined,null));const opts=[...e.w.document.querySelectorAll('li')];opts[1].addEventListener('click',()=>{const fresh=opts[1].cloneNode(true);fresh.setAttribute('aria-checked','true');opts[1].replaceWith(fresh)});
    await e.t.reviewApplyLetters('B',opts,false);assert.equal(opts[1].isConnected,false);assert.equal(e.w.document.querySelectorAll('li')[1].getAttribute('aria-checked'),'true');e.close();
  });
  await test('focus-only feedback cannot be mistaken for a selected answer',async()=>{
    const e=env(card(undefined,undefined,null));const opts=[...e.w.document.querySelectorAll('li')];opts[1].addEventListener('click',()=>opts[1].classList.add('is-focused'));e.t.setWait(async fn=>fn());
    await assert.rejects(e.t.reviewApplyLetters('B',opts,false),/状态未确认/);const report=e.values.get('zhs_last_selection_debug_v1');assert.equal(report.options[1].state.selected,false);assert.equal(JSON.stringify(report).includes('求 ∮'),false);assert.equal(JSON.stringify(report).includes('apiKey'),false);e.close();
  });
  await test('ignored clicks do not allow the flow to proceed silently',async()=>{
    const e=env(card(undefined,undefined,null));const opts=[...e.w.document.querySelectorAll('li')];e.t.setWait(async fn=>fn());await assert.rejects(e.t.reviewApplyLetters('B',opts,false),/状态未确认/);e.close();
  });
  await test('multi-select child state is used to clear stale selections',async()=>{
    const e=env(card('多选',['x','y','z'],null,true));const opts=[...e.w.document.querySelectorAll('.el-checkbox')];opts.forEach((opt,i)=>{opt.insertAdjacentHTML('afterbegin',`<i class="checkbox-icon ${i===1?'active':''}"></i>`);opt.addEventListener('click',()=>opt.querySelector('i').classList.toggle('active'))});
    await e.t.reviewApplyLetters('AC',opts,true);assert.deepEqual(opts.map(x=>e.t.reviewOptionState(x).selected),[true,false,true]);e.close();
  });
  await test('SVG radio dot changes are verified even when all CSS classes stay unchanged',async()=>{
    const e=env(card(undefined,undefined,null));const opts=[...e.w.document.querySelectorAll('li')];opts[1].insertAdjacentHTML('afterbegin','<svg><circle fill="transparent"></circle></svg>');opts[1].addEventListener('click',()=>opts[1].querySelector('circle').setAttribute('fill','#409eff'));
    await e.t.reviewApplyLetters('B',opts,false);assert.equal(e.t.reviewOptionState(opts[1]).selected,true);e.close();
  });
  await test('examPreview route is recognized before its content has loaded',()=>{
    const e=env('','https://ai-smart-course-student-pro.zhihuishu.com/examPreview/1');assert.equal(e.t.detectScreen(),e.t.SCREENS.REVIEW);e.close();
  });
  await test('preview Element Plus groups are read without answering-page selectors',()=>{
    const e=env(previewCard(1,'定理关系',['单连通','推广且包含特例','实轴积分','无需解析'],'B'));
    const units=e.t.reviewUnits();assert.equal(units.length,1);assert.equal(units[0].snapshot.stem,'定理关系');assert.equal(units[0].letters.join(''),'B');assert.equal(e.t.reviewCollectVisible().saved,1);e.close();
  });
  await test('preview memory matches the same stem and options in the original answering layout',()=>{
    const e=env(previewCard(1,'定理关系',['单连通','推广且包含特例','实轴积分','无需解析'],'B'));assert.equal(e.t.reviewCollectVisible().saved,1);
    e.w.document.body.innerHTML=card('定理关系',['推广且包含特例','实轴积分','无需解析','单连通'],null);assert.equal(e.t.reviewLookup(snapshot(e)),'A');e.close();
  });
  await test('five-card preview learns B, A, ABC, ABC and false separately',()=>{
    const e=env(previewCard(1,'复合闭路定理（多连通定理）推广了柯西积分定理，下列关于二者的关系描述正确的是：',['单连通','多连通，包含柯西特例','实轴','任意区域'],'B')+
      previewCard(2,'在复平面上，设 <img src="https://example.com/g.png"> 是多连通区域',['<img src="https://example.com/integral.png">','另一积分','任意常数','区域外'],'A')+
      previewCard(3,'复合闭路定理的应用',['选项一','选项二','选项三','选项四','选项五'],'A、B、C',true)+
      previewCard(4,'复合闭路定理的理论基础',['推广','路径','留数','非解析','任意变形'],'A、B、C',true)+
      previewCard(5,'奇点命题',['对','错'],'错'));
    const result=e.t.reviewCollectVisible();assert.equal(result.saved,5);assert.deepEqual(Array.from(result.cards,x=>x.letters.join('')),['B','A','ABC','ABC','B']);assert.equal(Object.keys(e.t.reviewReadStore()).length,5);e.close();
  });
  await test('judgment answer is matched by meaning after option order and label changes',()=>{
    const e=env(previewCard(5,'奇点命题',['对','错'],'错'));assert.equal(e.t.reviewCollectVisible().saved,1);e.w.document.body.innerHTML=card('奇点命题',['错误','正确'],null);assert.equal(e.t.reviewLookup(snapshot(e)),'A');e.close();
  });
  await test('preview missing an answer cannot borrow one from its neighboring question',()=>{
    const e=env(previewCard(1,'第一题',['x','y'],'A')+previewCard(2,'第二题',['x','y'],'未知'));const units=e.t.reviewUnits();assert.equal(units.length,2);assert.equal(e.t.reviewCollectVisible().saved,1);e.close();
  });
  await test('answers outside the current viewport are included without clicking disabled options',async()=>{
    const e=env(previewCard(1,'第一题',['x','y'],'A')+previewCard(2,'第二题',['x','y'],'B'));e.t.setSleep(async()=>{});let clicks=0;e.w.document.addEventListener('click',()=>clicks++);
    const doc=e.w.document.documentElement;Object.defineProperty(doc,'clientHeight',{value:500});Object.defineProperty(doc,'scrollHeight',{value:2000});
    const result=await e.t.reviewScanPage();assert.equal(result.saved,2);assert.equal(result.complete,true);assert.equal(doc.scrollTop,0);assert.equal(clicks,0);e.close();
  });
  await test('scroll sweep collects questions appended lazily and restores the previous position',async()=>{
    const e=env(previewCard(1,'第一题',['x','y'],'A'));e.t.setSleep(async()=>{});const doc=e.w.document.documentElement;let top=100,loaded=false;
    Object.defineProperty(doc,'clientHeight',{value:500});Object.defineProperty(doc,'scrollHeight',{get(){return loaded?2400:1400}});
    Object.defineProperty(doc,'scrollTop',{get(){return top},set(value){top=value;if(value>=600&&!loaded){loaded=true;e.w.document.body.insertAdjacentHTML('beforeend',previewCard(2,'延迟题',['x','y'],'B'))}}});
    const result=await e.t.reviewScanPage();assert.equal(result.expected,2);assert.equal(result.saved,2);assert.equal(result.complete,true);assert.equal(doc.scrollTop,100);e.close();
  });
  await test('scroll sweep detects a nested scrolling panel as well as document scrolling',async()=>{
    const e=env('<main style="overflow-y:auto">'+previewCard(1,'第一题',['x','y'],'A')+'</main>');e.t.setSleep(async()=>{});const panel=e.w.document.querySelector('main');let top=0,loaded=false;
    Object.defineProperty(panel,'clientHeight',{value:500});Object.defineProperty(panel,'scrollHeight',{value:1800});Object.defineProperty(panel,'scrollTop',{get(){return top},set(value){top=value;if(value>=600&&!loaded){loaded=true;panel.insertAdjacentHTML('beforeend',previewCard(2,'内部延迟题',['x','y'],'B'))}}});
    const result=await e.t.reviewScanPage();assert.equal(result.saved,2);assert.equal(panel.scrollTop,0);e.close();
  });
  await test('stopping during scroll leaves the attempt pending and restores scroll position',async()=>{
    const e=env(previewCard(1,'第一题',['x','y'],'A'));const doc=e.w.document.documentElement;Object.defineProperty(doc,'clientHeight',{value:500});Object.defineProperty(doc,'scrollHeight',{value:2000});doc.scrollTop=100;
    e.t.setSleep(async()=>{e.w.__ZHS_STOP=true});const result=await e.t.reviewScanPage();assert.equal(result.aborted,true);assert.equal(doc.scrollTop,100);assert.equal(e.values.has('zhs_review_history_done_v1'),false);e.close();
  });
  await test('published ABC is learned even when the student selected only AC',()=>{
    const e=env(previewCard(3,'复合闭路定理的应用',['选项一','选项二','选项三','选项四','选项五'],'A、B、C',true));
    const inputs=e.w.document.querySelectorAll('input');inputs[0].checked=true;inputs[2].checked=true;
    assert.equal(e.t.reviewCollectVisible().saved,1);e.w.document.body.innerHTML=card('复合闭路定理的应用',['选项一','选项二','选项三','选项四','选项五'],null,true);assert.equal(e.t.reviewLookup(snapshot(e)),'ABC');e.close();
  });
  await test('whole preview flow completes all five items and clears pending review',async()=>{
    const e=env(previewCard(1,'题一',['x','y'],'B')+previewCard(2,'题二',['x','y'],'A')+previewCard(3,'题三',['x','y','z'],'A、B、C',true)+previewCard(4,'题四',['x','y','z'],'A、B、C',true)+previewCard(5,'题五',['对','错'],'错'),'https://ai-smart-course-student-pro.zhihuishu.com/examPreview/1');
    e.values.set('zhs_review_pending_v1',true);e.t.setSleep(async()=>{});e.t.setWait(async fn=>{for(let i=0;i<4;i++){const x=fn();if(x)return x}return null});
    assert.equal(await e.t.reviewRunPage(),true);assert.equal(Object.keys(e.t.reviewReadStore()).length,5);assert.equal(e.values.get('zhs_review_pending_v1'),false);e.close();
  });
  await test('wrong-first question order and shuffled options still use five correct references with zero AI calls',async()=>{
    const qs=[
      {stem:'复合闭路定理的关系',opts:['单连通','推广且包含特例','实轴','无需解析'],ans:[1]},
      {stem:'设 <img src="https://example.com/g.png"> 内解析',opts:['<img src="https://example.com/integral.png">','其他积分','任意常数','区域外'],ans:[0]},
      {stem:'复合闭路定理的应用',opts:['分解积分','组合积分','路径条件','奇点','实值'],ans:[0,1,2],multi:true},
      {stem:'复合闭路定理的理论基础',opts:['推广','路径','留数','非解析','任意变形'],ans:[0,1,2],multi:true},
      {stem:'奇点命题',opts:['对','错'],ans:[1]}
    ];
    const e=env(qs.map((q,i)=>previewCard(i+1,q.stem,q.opts,q.ans.map(j=>String.fromCharCode(65+j)).join('、'),q.multi)).join(''));
    // The judgment review announces a word instead of an option letter.
    e.w.document.querySelectorAll('.reference p')[8].textContent='参考答案：错';
    assert.equal(e.t.reviewCollectVisible().saved,5);let ai=0;const logs=[];e.t.setPanel((event,message)=>{if(event==='memory')logs.push(message)});e.t.setAI(async()=>{ai++;throw new Error('reference must bypass AI')});
    const order=[2,4,0,3,1];
    for(let n=0;n<order.length;n++) {
      const q=qs[order[n]], permutation=q.opts.map((_,i)=>i).reverse();
      e.w.document.body.innerHTML=card(`${n+1}、 【${q.multi?'多选题':'单选题'}】 ${q.stem}`,permutation.map(i=>q.opts[i]),null,q.multi);
      const opts=[...e.w.document.querySelectorAll(q.multi?'.el-checkbox':'li')];
      opts[opts.length-1].classList.add('is-checked');
      for(const opt of opts)opt.addEventListener('click',()=>{if(q.multi)opt.classList.toggle('is-checked');else{opts.forEach(x=>x.classList.remove('is-checked'));opt.classList.add('is-checked')}});
      const expected=permutation.map((original,i)=>q.ans.includes(original)?String.fromCharCode(65+i):'').join('');
      assert.equal(await e.t.answerWithAI([]),expected);
      assert.equal(opts.map((opt,i)=>opt.classList.contains('is-checked')?String.fromCharCode(65+i):'').join(''),expected);
    }
    assert.equal(ai,0);const report=e.t.reviewAuditReport();assert.equal(report.stats.hits,5);assert.equal(report.stats.ai,0);assert.equal(report.trace.filter(x=>x.source==='platform-review').length,5);
    for(const entry of report.trace){assert.deepEqual([...entry.selected.map(x=>x.content)].sort(),[...entry.referenceAnswers].sort());assert.equal(entry.selected.map(x=>x.letter).join(''),entry.appliedLetters)}
    assert.equal(logs.filter(x=>x.includes('使用参考答案，已核对勾选')).length,5);e.close();
  });
  await test('reference letters bind to displayed labels even when DOM control order differs',async()=>{
    const e=env(previewCard(1,'标签映射',['甲','乙','丙'],'A'));
    const group=e.w.document.querySelector('.el-radio-group');group.prepend(group.lastElementChild);
    assert.equal(e.t.reviewCollectVisible().saved,1);
    e.w.document.body.innerHTML=card('标签映射',['甲','乙','丙'],null);
    const list=e.w.document.querySelector('ul');list.prepend(list.lastElementChild);
    const opts=[...list.children];opts.forEach(opt=>opt.addEventListener('click',()=>{opts.forEach(x=>x.classList.remove('is-checked'));opt.classList.add('is-checked')}));
    e.t.setAI(()=>{throw new Error('AI must not run')});assert.equal(await e.t.answerWithAI([]),'A');assert.equal(list.querySelector('.is-checked').textContent,'A甲');e.close();
  });
  await test('page number and type decorations do not change content identity',()=>{
    const e=env(previewCard(9,'设 G 在区域内解析',['答案 甲','答案 乙'],'B'));assert.equal(e.t.reviewCollectVisible().saved,1);
    e.w.document.body.innerHTML=card('第 1 题：【单选题】 设G在 区域内 解析',['答案甲','答案乙'],null);assert.equal(e.t.reviewLookup(snapshot(e)),'B');e.close();
  });
  await test('actual question text starting with a type name is preserved',()=>{
    const e=env(card('判断题是否需要说明理由',['需要','不需要'],null));assert.equal(snapshot(e).stem,'判断题是否需要说明理由');e.close();
  });
  await test('standalone mathematical A in an option is preserved',()=>{
    const e=env(card('求值',['<span>A</span><span>+B</span>','C'],null));assert.equal(snapshot(e).choices[0],'A+B');e.close();
  });
  await test('old version reference storage is normalized and remains usable',()=>{
    const e=env(card('复合闭路定理',['甲','乙'],null));const key=JSON.stringify([' 5、 复合 闭路 定理 ',false,[' 甲 ','乙']]);e.values.set('zhs_review_memory_v1',{[key]:{answers:[' 乙 '],source:'platform-review',savedAt:1}});assert.equal(e.t.reviewLookup(snapshot(e)),'B');e.close();
  });
  await test('same stem with unmatched options is blocked and recorded rather than silently guessed',async()=>{
    const e=env(previewCard(1,'同题',['甲','乙'],'B'));e.t.reviewCollectVisible();e.w.document.body.innerHTML=card('同题',['甲','丙'],null);let ai=0;e.t.setAI(()=>{ai++;return{raw:'A'}});
    await assert.rejects(e.t.answerWithAI([]),/选项无法与参考答案一一对应/);assert.equal(ai,0);assert.equal(e.t.reviewAuditReport().stats.blocked,1);e.close();
  });
  await test('new question uses AI with an explicit miss reason and separate counter',async()=>{
    const e=env(card('全新题',['甲','乙'],null));const opts=[...e.w.document.querySelectorAll('li')];opts.forEach(opt=>opt.addEventListener('click',()=>opt.classList.add('is-checked')));let ai=0;e.t.setAI(async()=>{ai++;return{raw:'B'}});
    assert.equal(await e.t.answerWithAI([]),'B');assert.equal(ai,1);const report=e.t.reviewAuditReport();assert.equal(report.stats.hits,0);assert.equal(report.stats.ai,1);assert.deepEqual(Array.from(report.trace,x=>x.source),['miss','ai']);assert.equal(Object.keys(e.t.reviewReadStore()).length,0);e.close();
  });
  await test('hidden stale multiple-choice controls cannot determine the current single-choice answer',async()=>{
    const e=env(previewCard(1,'当前题',['甲','乙'],'B'));e.t.reviewCollectVisible();e.w.document.body.innerHTML='<div style="display:none">'+card('旧题',['旧甲','旧乙'],null,true)+'</div>'+card('当前题',['甲','乙'],null);
    const current=e.t.reviewCurrentQuiz();assert.equal(current.multiple,false);assert.equal(current.options.length,2);current.options.forEach(opt=>opt.addEventListener('click',()=>opt.classList.add('is-checked')));e.t.setAI(()=>{throw new Error('AI must not run')});assert.equal(await e.t.answerWithAI([]),'B');e.close();
  });
  await test('question changes during checkbox application cannot receive stale reference clicks',async()=>{
    const e=env(card('原题',['甲','乙','丙'],null,true));const opts=[...e.w.document.querySelectorAll('.el-checkbox')];let clicks=0;opts[0].addEventListener('click',()=>{clicks++;e.w.document.body.innerHTML=card('下一道题',['甲','乙','丙'],null,true)});await assert.rejects(e.t.reviewApplyLetters('AB',opts,true),/题目或选项发生变化/);assert.equal(clicks,1);e.close();
  });
  await test('two review questions with the same displayed number are both retained',async()=>{
    const e=env(previewCard(1,'不同题甲',['甲','乙'],'A')+previewCard(1,'不同题乙',['甲','乙'],'B'));e.t.setSleep(async()=>{});const result=await e.t.reviewScanPage();assert.equal(result.expected,2);assert.equal(result.saved,2);e.close();
  });
  await test('formula SVGs ignore generated IDs and display size while preserving mathematical geometry',()=>{
    const old='<svg width="10" height="10"><defs><path id="old" d="M0 1 L2 3"></path></defs><use href="#old"></use></svg>';
    const next='<svg width="30" height="30"><defs><path id="new" d="M0 1 L2 3"></path></defs><use href="#new"></use></svg>';
    const e=env(previewCard(1,'公式 '+old,['甲','乙'],'B'));e.t.reviewCollectVisible();e.w.document.body.innerHTML=card('公式'+next,['甲','乙'],null);assert.equal(e.t.reviewLookup(snapshot(e)),'B');
    e.w.document.body.innerHTML=card('公式'+next.replace('M0 1 L2 3','M0 1 L2 4'),['甲','乙'],null);assert.equal(e.t.reviewLookup(snapshot(e)),null);e.close();
  });
  await test('real answering root containing options and uploader yields only the stem and reuses reference',async()=>{
    const e=env(previewCard(1,'关于柯西不等式（定理3.10），下列说法正确的是：',['点积与模长的关系','仅实数','无等号条件','无三角不等式'],'A'));e.t.reviewCollectVisible();
    e.w.document.body.innerHTML=card('关于柯西不等式（定理3.10），下列说法正确的是：',['点积与模长的关系','仅实数','无等号条件','无三角不等式'],null);
    const root=e.w.document.querySelector('.questionContent'),opts=[...e.w.document.querySelectorAll('li')];root.append(e.w.document.querySelector('ul'));root.insertAdjacentHTML('beforeend','<div class="upload">上传附件 Processing dropped files... 文件预览 无法预览该文件，请下载后进行查看</div>');
    opts.forEach(opt=>opt.addEventListener('click',()=>opt.classList.add('is-checked')));e.t.setAI(()=>{throw new Error('AI must not run')});assert.equal(await e.t.answerWithAI([]),'A');assert.equal(e.t.reviewAuditReport().stats.hits,1);e.close();
  });
  await test('multi-choice bare ABC prefixes map uniquely without dropping mathematical initial letters',async()=>{
    const e=env(previewCard(1,'证明与应用',['构造非负二次型','Hilbert空间','级数收敛','错误项','另一错误项'],'A、B、C',true));e.t.reviewCollectVisible();
    e.w.document.body.innerHTML=card('证明与应用',['A构造非负二次型','BHilbert空间','C级数收敛','D错误项','E另一错误项'],null,true);
    const opts=[...e.w.document.querySelectorAll('.el-checkbox')];opts.forEach(opt=>opt.addEventListener('click',()=>opt.classList.toggle('is-checked')));e.t.setAI(()=>{throw new Error('AI must not run')});assert.equal(await e.t.answerWithAI([]),'ABC');const entry=e.t.reviewAuditReport().trace.at(-1);assert.equal(entry.correspondence[0].currentContent,'A构造非负二次型');assert.equal(entry.correspondence[0].referenceContent,'构造非负二次型');e.close();
  });
  await test('different image URLs reuse a reference only after verified image-content hashes agree',async()=>{
    const e=env(previewCard(1,'设 <img src="https://example.com/old-formula.png"> 解析',['甲','乙'],'B'));e.t.reviewCollectVisible();
    e.w.document.body.innerHTML=card('设 <img src="https://example.com/new-formula.png"> 解析',['乙','甲'],null);
    e.t.setImageFetcher(async()=> 'pixels-v1:verified-same-formula');e.t.setAI(()=>{throw new Error('AI must not run')});const opts=[...e.w.document.querySelectorAll('li')];opts.forEach(opt=>opt.addEventListener('click',()=>opt.classList.add('is-checked')));
    assert.equal(await e.t.answerWithAI([]),'A');assert.equal(e.t.reviewAuditReport().stats.hits,1);e.close();
  });
  await test('different image content does not reuse a template-matched reference',async()=>{
    const e=env(previewCard(1,'设 <img src="https://example.com/old.png"> 解析',['甲','乙'],'B'));e.t.reviewCollectVisible();e.w.document.body.innerHTML=card('设 <img src="https://example.com/new.png"> 解析',['甲','乙'],null);
    e.t.setImageFetcher(async url=>'pixels-v1:'+url);e.t.setAI(async()=>({raw:'A'}));const opts=[...e.w.document.querySelectorAll('li')];opts.forEach(opt=>opt.addEventListener('click',()=>opt.classList.add('is-checked')));assert.equal(await e.t.answerWithAI([]),'A');assert.equal(e.t.reviewAuditReport().stats.hits,0);assert.equal(e.t.reviewAuditReport().stats.ai,1);e.close();
  });
  await test('failed formula verification cannot silently route a known template back to AI',async()=>{
    const e=env(previewCard(1,'设 <img src="https://example.com/old.png"> 解析',['甲','乙'],'B'));e.t.reviewCollectVisible();e.w.document.body.innerHTML=card('设 <img src="https://example.com/new.png"> 解析',['甲','乙'],null);e.t.setImageFetcher(async()=>{throw new Error('network failure')});let ai=0;e.t.setAI(()=>{ai++;return{raw:'A'}});
    await assert.rejects(e.t.answerWithAI([]),/公式图片尚未完成内容核对/);assert.equal(ai,0);e.close();
  });
  await test('formula pixel hashes ignore white padding and retain different glyph pixels',async()=>{
    const e=env();const {webcrypto}=require('node:crypto');Object.defineProperty(e.w.crypto,'subtle',{value:webcrypto.subtle});
    e.w.createImageBitmap=async blob=>({...blob.bitmap,close(){}});let image;
    e.w.HTMLCanvasElement.prototype.getContext=()=>({drawImage(bitmap){image=bitmap},getImageData(){return image}});
    const picture=(width,height,pixel)=>({bitmap:{width,height,data:Uint8ClampedArray.from(Array.from({length:width*height},(_,i)=>i===pixel?[0,0,0,255]:[255,255,255,255]).flat())}});
    const a=await e.t.reviewHashBlob(picture(1,1,0)),b=await e.t.reviewHashBlob(picture(3,3,4));assert.equal(a,b);
    const different=picture(1,1,0);different.bitmap.data[0]=100;assert.notEqual(await e.t.reviewHashBlob(different),a);e.close();
  });
  console.log(`\n${passed} behavior checks passed.`);
})().catch(err=>{console.error(err);process.exitCode=1});
