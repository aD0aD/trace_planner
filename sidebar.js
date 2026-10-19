/* One sidebar, one route library: move existing controls without cloning IDs or handlers. */
window.Sidebar=(()=>{
  const KEY='trace_planner_sidebar_v1';
  let ready=false,preferences={},announcedTrackName=null;
  const modules=new Map();
  const names={
    importTracksBox:['轨迹列表（导入 / 拼接）','Tracks (imported / stitched)'],
    overviewBox:['当前轨迹概览','Current route overview'],
    onlineSearchBox:['在线找轨迹','Find tracks online'],
    clipBox:['截取轨迹片段','Clip a route segment'],
    basketBox:['拼接篮子','Stitching basket'],
    profileBox:['路线高度图','Elevation profile'],
    elevationBox:['爬升计算设置','Elevation calculation'],
    breakpointsBox:['断点与分段统计','Breakpoints & segment statistics'],
    annotationsBox:['路线标注','Route annotations'],
    leaderPlanner:['领队行程与路书','Leader itinerary & roadbook'],
    demPanel:['本地 DEM 地形图','Local DEM terrain map'],
    exportBox:['导出与工程','Export & project']
  };
  const localized=pair=>pair[currentLang==='en'?1:0];
  function remember(){try{localStorage.setItem(KEY,JSON.stringify(preferences));}catch{/* Folding still works without persistent storage. */}}
  function module(id,open){
    const original=$(id);let element=original,summary;
    if(original.tagName==='DETAILS'){
      summary=original.querySelector(':scope > summary');
      const title=document.createElement('span');title.className='panel-title';title.textContent=summary.textContent;
      // DEM owns its summary localization; put the same attributes on the title span.
      for(const key of ['data-dem-zh','data-dem-en'])if(summary.hasAttribute(key)){title.setAttribute(key,summary.getAttribute(key));summary.removeAttribute(key);}
      summary.replaceChildren(title);
      const content=document.createElement('div');content.className='panel-body';
      for(const child of [...element.childNodes])if(child!==summary)content.append(child);
      element.append(content);
    }else{
      element=document.createElement('details');element.id=id;element.className='box';
      summary=document.createElement('summary');const title=original.querySelector(':scope > .row:first-child b, :scope > b:first-child');
      const headingRow=title?.parentElement;
      const label=title||document.createElement('span');label.classList.add('panel-title');summary.append(label);
      if(headingRow?.classList.contains('row'))headingRow.remove();
      const content=document.createElement('div');content.className='panel-body';content.append(...original.childNodes);
      element.append(summary,content);original.replaceWith(element);
    }
    element.className='box panel-module';element.removeAttribute('style');
    element.open=typeof preferences[id]==='boolean'?preferences[id]:open;
    element.addEventListener('toggle',()=>{preferences[id]=element.open;remember();});
    modules.set(id,element);return element;
  }
  function setMode(mode){
    if(!ready)return;
    const stitch=mode==='stitch';$('stitchWorkspace').hidden=!stitch;$('analysisWorkspace').hidden=stitch;
    $('workspaceTitle').textContent=stitch?localized(['轨迹拼接','Track stitching']):localized(['轨迹分析','Track analysis']);
    $('workspaceHint').textContent=stitch?localized(['选择轨迹 → 截取片段 → 排序拼接；生成的轨迹会自动加入上方列表。','Select a route → clip segments → order and stitch. New routes appear in the list above.']):localized(['选择上方当前轨迹，查看高度、分段与标注，并制定领队行程。','Select the current route above to inspect elevation, segments and waypoints, and plan your itinerary.']);
    $('sidebarWorkspaceHeader').dataset.mode=mode;
  }
  function translate(){
    if(!ready)return;
    for(const [id,element] of modules)element.querySelector(':scope > summary .panel-title').textContent=localized(names[id]);
    $('expandModulesBtn').textContent=localized(['展开全部','Expand all']);$('collapseModulesBtn').textContent=localized(['折叠全部','Collapse all']);
    $('analysisTrackLabel').textContent=localized(['当前轨迹','Current route']);
    $('projectTitleText').textContent=localized(['工程保存与恢复','Save & restore project']);
    $('exportHintText').textContent=t('exportHint');
    if(announcedTrackName)$('trackFeedback').textContent=localized(['已自动保存新轨迹：','New route saved automatically: '])+announcedTrackName;
    setMode(window.currentToolMode||'stitch');updateTrackCount();
  }
  function openModule(id){const el=modules.get(id);if(el){el.open=true;preferences[id]=true;remember();}}
  function updateTrackCount(){
    if(!ready)return;
    $('trackCount').textContent=String(tracks.length);
    $('tracksEmpty').hidden=tracks.length>0;
    $('tracksEmpty').textContent=localized(['还没有轨迹，请先导入 GPX / KML / KMZ。','No tracks yet. Import GPX / KML / KMZ to begin.']);
  }
  function announceTrack(track){
    if(!ready)return;announcedTrackName=track.name;openModule('importTracksBox');
    $('trackFeedback').textContent=localized(['已自动保存新轨迹：','New route saved automatically: '])+track.name;
    $('trackFeedback').scrollIntoView({block:'nearest',behavior:'instant'});
  }
  function init(){
    if(ready)return;
    try{const saved=JSON.parse(localRead(KEY)||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))preferences=saved;}catch{}
    // Isolate the profile so the analysis view never carries clipping controls.
    const profile=document.createElement('div');profile.id='profileBox';profile.className='box';
    $('clipBox').after(profile);profile.append($('profileHeading'),$('liveProfileCanvas').parentElement,$('profileHintText'));
    $('importTracksBox').querySelector(':scope > .hint').classList.add('import-hint');
    $('basketBox').querySelector(':scope > .hint').classList.add('basket-hint');
    $('elevationBox').querySelector(':scope > .hint').classList.add('elevation-hint');
    $('breakpointsBox').querySelector(':scope > .hint').classList.add('breakpoints-hint');
    // One shared current-route picker replaces the old analysis-target card.
    const target=$('analysisTargetBox'),picker=target.querySelector('select').parentElement;
    const label=document.createElement('label');label.id='analysisTrackLabel';label.htmlFor='analysisTrackSelect';
    picker.querySelector('.label').replaceWith(label);picker.className='route-picker';
    const library=$('importTracksBox');library.querySelector('input').before(picker);
    const feedback=document.createElement('div');feedback.id='trackFeedback';feedback.className='hint';feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    library.append(feedback);const active=target.querySelector('.analysis-target');active.querySelector('.hint').remove();active.hidden=true;picker.after(active);target.remove();
    const empty=document.createElement('p');empty.id='tracksEmpty';empty.className='hint';$('trackList').before(empty);
    // Export and project persistence become a single common module, with the original controls intact.
    const project=$('projectBox');$('exportBox').append(...project.childNodes);project.remove();
    for(const [id,open] of [['importTracksBox',true],['overviewBox',false],['onlineSearchBox',false],['clipBox',true],['basketBox',true],['profileBox',true],['elevationBox',false],['breakpointsBox',true],['annotationsBox',true],['leaderPlanner',false],['demPanel',false],['exportBox',false]])module(id,open);
    const badge=document.createElement('span');badge.id='trackCount';badge.className='panel-count';badge.setAttribute('aria-hidden','true');$('importTracksBox').querySelector('summary').append(badge);
    const header=document.createElement('section');header.id='sidebarWorkspaceHeader';header.className='workspace-header';
    header.innerHTML='<h2 id="workspaceTitle"></h2><p id="workspaceHint"></p><div class="module-actions"><button type="button" id="expandModulesBtn"></button><button type="button" id="collapseModulesBtn"></button></div>';
    const stitch=document.createElement('section');stitch.id='stitchWorkspace';stitch.setAttribute('role','tabpanel');stitch.setAttribute('aria-labelledby','tabStitch');
    const analysis=document.createElement('section');analysis.id='analysisWorkspace';analysis.setAttribute('role','tabpanel');analysis.setAttribute('aria-labelledby','tabAnalysis');
    $('panel').append($('importTracksBox'),$('overviewBox'),header,stitch,analysis,$('exportBox'));
    stitch.append($('onlineSearchBox'),$('clipBox'),$('basketBox'));
    analysis.append($('profileBox'),$('elevationBox'),$('breakpointsBox'),$('annotationsBox'),$('leaderPlanner'),$('demPanel'));
    document.querySelector('.tabs').setAttribute('role','tablist');
    for(const [id,panel] of [['tabStitch','stitchWorkspace'],['tabAnalysis','analysisWorkspace']]){$(id).setAttribute('role','tab');$(id).setAttribute('aria-controls',panel);}
    const toggleAll=open=>{for(const element of modules.values())if(!element.closest('[hidden]')){element.open=open;preferences[element.id]=open;}remember();};
    $('expandModulesBtn').onclick=()=>toggleAll(true);$('collapseModulesBtn').onclick=()=>toggleAll(false);
    document.querySelector('.tabs').addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();
      const mode=e.key==='Home'?'stitch':e.key==='End'?'analysis':window.currentToolMode==='stitch'?'analysis':'stitch';
      setToolTab(mode);$(mode==='stitch'?'tabStitch':'tabAnalysis').focus();
    });
    ready=true;translate();
  }
  return {get ready(){return ready;},init,setMode,translate,updateTrackCount,openModule,announceTrack};
})();
