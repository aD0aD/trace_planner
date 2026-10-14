/* DEM controls, map overlay, and terrain-map export. Raw TIFFs stay outside project snapshots. */
(function() {
  'use strict';
  const C=DemCore;
  const fileMode=location.protocol==='file:';
  let worker=null,token=0,sources=[],expected=[],result=null,overlay=null,timer=null,busy=false,signature='',selecting=false,firstCorner=null,selection=null;
  let options={mode:'route',bufferKm:2,interval:20,shade:true,visible:true,auto:true,customBounds:null};
  const pane=map.createPane('terrainPane');pane.style.zIndex='250';pane.style.pointerEvents='none';
  const coverage=L.layerGroup().addTo(map);
  const text=(zh,en)=>currentLang==='en'?en:zh;
  function status(zh,en=zh,error=false){$('demStatus').textContent=text(zh,en);$('demStatus').classList.toggle('dem-status-error',error);}
  function controls() {
    return {...options,mode:$('demCropMode').value,bufferKm:Number($('demBuffer').value),interval:Number($('demInterval').value),
      shade:$('demShade').checked,visible:$('demVisible').checked,auto:$('demAuto').checked};
  }
  function syncControls() {
    $('demCropMode').value=options.mode;$('demBuffer').value=options.bufferKm;$('demInterval').value=options.interval;
    $('demShade').checked=options.shade;$('demVisible').checked=options.visible;$('demAuto').checked=options.auto;
    $('demBuffer').disabled=options.mode!=='route';
  }
  function setBusy(value) {
    busy=value;$('demCancel').disabled=!value;$('demExport').disabled=value||!result;
    $('demRender').disabled=value||fileMode;$('demInput').disabled=value||fileMode;
    $('demFiles').querySelectorAll('button').forEach(button=>button.disabled=value);
  }
  function ensureWorker() {
    if(worker)return worker;
    if(location.protocol==='file:')throw Error(text('请通过本地 HTTP 服务或网站打开，才能读取 DEM。','Open via a local HTTP server or the website to use DEM.'));
    worker=new Worker('dem-worker.js');
    worker.onmessage=({data})=>{
      if(data.token!==token)return;
      if(data.type==='progress'){status(`正在读取 ${data.name} · ${data.percent}%`,`Reading ${data.name} · ${data.percent}%`);return;}
      setBusy(false);
      if(data.type==='error'){signature='';status(data.message,data.message,true);return;}
      if(data.type==='opened') {
        sources=data.sources;expected=sources.map(s=>({name:s.name,size:s.size,bounds:s.bounds.slice()}));signature='';
        // A new source selection invalidates any terrain rendered from the previous files.
        if(data.replaced)clearResult();renderFiles();
        const errors=data.errors.join('\n');
        status(errors||text(sources.length?`已加载 ${sources.length} 份 DEM，可继续添加其他文件。`:'DEM 已移除',sources.length?`${sources.length} DEM files loaded; you can add more.`:'DEM removed'),undefined,!!errors);
        if(typeof observeChanges==='function')observeChanges();
        if(sources.length&&options.auto&&!errors)schedule(true);
      }else if(data.type==='rendered') {
        result=data;signature=data.requestSignature||signature;drawOverlay();showQuality();$('demExport').disabled=false;
        window.dispatchEvent(new CustomEvent('terrainready'));
      }else if(data.type==='cleared'){status('DEM 已移除','DEM removed');}
    };
    worker.onerror=e=>{setBusy(false);signature='';status(text('DEM 处理失败：','DEM processing failed: ')+e.message);worker.terminate();worker=null;};
    return worker;
  }
  function clearResult() {result=null;if(overlay)map.removeLayer(overlay);overlay=null;$('demExport').disabled=true;$('demLegend').replaceChildren();}
  function renderFiles() {
    const list=$('demFiles');list.replaceChildren();coverage.clearLayers();
    for(const s of sources) {
      const li=document.createElement('li'),label=document.createElement('span');label.textContent=`${s.name} · ${(s.size/1048576).toFixed(1)} MB · ${s.width}×${s.height} · ${s.overviews} ${text('概览','overviews')}`;
      const remove=document.createElement('button');remove.type='button';remove.textContent=text('移除','Remove');remove.setAttribute('aria-label',text(`移除 ${s.name}`,`Remove ${s.name}`));remove.disabled=busy;
      remove.onclick=()=>{clearTimeout(timer);ensureWorker().postMessage({type:'remove',token:++token,id:s.id});setBusy(true);$('demCancel').disabled=true;status('正在移除 DEM…','Removing DEM…');};
      li.append(label,remove);
      list.append(li);
      if(!result)L.rectangle([[s.bounds[1],s.bounds[0]],[s.bounds[3],s.bounds[2]]],{color:'#0f766e',weight:1,fill:false,interactive:false}).addTo(coverage);
    }
    if(!sources.length&&expected.length) {
      const li=document.createElement('li');li.textContent=text('请重新选择 DEM：','Reselect DEM: ')+expected.map(s=>s.name).join('、');list.append(li);
    }
  }
  function showQuality() {
    if(!result)return;
    const {grid:g,known,stats}=result,pct=(known/(g.width*g.height)*100).toFixed(1);
    status(`已生成 ${g.width}×${g.height} · 约 ${Math.round(stats.groundStep)} m/像元 · 覆盖 ${pct}% · 使用 ${stats.used.length} 份 DEM`,`Generated ${g.width}×${g.height} · ~${Math.round(stats.groundStep)} m/pixel · ${pct}% coverage · ${stats.used.length} DEM files`);
    const legend=$('demLegend');legend.replaceChildren();
    const gradient=document.createElement('div');gradient.className='dem-gradient';legend.append(gradient);
    const label=document.createElement('div');label.textContent=`${Math.floor(result.min)} – ${Math.ceil(result.max)} m · ${result.interval?text(`等高距 ${result.interval} m`,`Contours ${result.interval} m`):text('等高线关闭','Contours off')}`;legend.append(label);
    if(known<g.width*g.height){const p=document.createElement('div');p.className='warn';p.textContent=text('空白区域无 DEM 数据；不会补成 0 米。','Blank areas have no DEM data; they are not filled with zero.');legend.append(p);}
  }
  function cropBounds() {
    if(options.mode==='route') {
      if(route.length<2)throw Error(text('请先导入路线，或选择当前视野。','Import a route, or choose current map view.'));
      return C.routeBounds(route,options.bufferKm);
    }
    if(options.mode==='custom') {
      if(!options.customBounds)throw Error(text('请先在地图上框选范围。','Select a crop on the map first.'));
      return options.customBounds;
    }
    const b=map.getBounds();return [b.getWest(),Math.max(-85,b.getSouth()),b.getEast(),Math.min(85,b.getNorth())];
  }
  function render(force=false) {
    clearTimeout(timer);
    try {
      options=controls();
      if(!sources.length)throw Error(text('请先选择 _dem.tif 高程文件。','Select elevation GeoTIFF files first.'));
      const bounds=cropBounds();
      if(bounds[0]<-180||bounds[2]>180||bounds[2]<=bounds[0]||bounds[3]<=bounds[1])throw Error(text('请缩小地图范围；暂不支持跨越日期变更线。','Narrow the map view; crossing the date line is unsupported.'));
      const key=JSON.stringify([bounds,options.interval,options.shade,sources.map(s=>s.name)]);
      if(!force&&key===signature)return;
      signature=key;setBusy(true);status('正在生成裁剪区域的地形图…','Generating cropped terrain…');
      ensureWorker().postMessage({type:'render',token:++token,options:{bounds,interval:options.interval,shade:options.shade}});
    }catch(e){setBusy(false);signature='';status(e.message,e.message,true);}
  }
  function schedule(force=false) {
    if(!sources.length||!options.auto||!options.visible)return;
    clearTimeout(timer);timer=setTimeout(()=>render(force),350);
  }
  function drawTerrain(ctx,r,scale=1,labels=true,styleFactor=1) {
    const {grid:g,lines}=r;
    const raster=document.createElement('canvas');raster.width=g.width;raster.height=g.height;
    raster.getContext('2d').putImageData(new ImageData(r.rgba,g.width,g.height),0,0);
    ctx.drawImage(raster,0,0,g.width*scale,g.height*scale);
    ctx.save();ctx.scale(scale,scale);ctx.lineJoin='round';ctx.lineCap='round';
    for(const major of [false,true]) {
      ctx.strokeStyle=major?'rgba(57,39,10,.88)':'rgba(73,52,8,.6)';ctx.lineWidth=(major?1:.48)*styleFactor;ctx.beginPath();
      for(const line of lines)if(line.major===major){ctx.moveTo(...line.points[0]);for(let i=1;i<line.points.length;i++)ctx.lineTo(...line.points[i]);}
      ctx.stroke();
    }
    if(labels) {
      const occupied=[];ctx.font=`${11*styleFactor}px sans-serif`;ctx.textAlign='center';ctx.textBaseline='middle';
      for(const line of lines) {
        if(!line.major||line.points.length<8)continue;
        let length=0;for(let i=1;i<line.points.length;i++)length+=Math.hypot(line.points[i][0]-line.points[i-1][0],line.points[i][1]-line.points[i-1][1]);
        if(length<70*styleFactor)continue;
        const j=Math.floor(line.points.length/2),p=line.points[j];
        if(p[0]<20*styleFactor||p[1]<12*styleFactor||p[0]>g.width-20*styleFactor||p[1]>g.height-12*styleFactor||occupied.some(q=>Math.abs(q[0]-p[0])<65*styleFactor&&Math.abs(q[1]-p[1])<25*styleFactor))continue;
        occupied.push(p);const a=line.points[j-3],b=line.points[Math.min(line.points.length-1,j+3)];
        let angle=Math.atan2(b[1]-a[1],b[0]-a[0]);if(angle>Math.PI/2)angle-=Math.PI;if(angle<-Math.PI/2)angle+=Math.PI;
        ctx.save();ctx.translate(...p);ctx.rotate(angle);ctx.strokeStyle='rgba(255,245,202,.9)';ctx.lineWidth=3*styleFactor;ctx.strokeText(line.elevation,0,0);ctx.fillStyle='#302007';ctx.fillText(line.elevation,0,0);ctx.restore();
      }
    }
    ctx.restore();
  }
  function drawOverlay() {
    if(overlay)map.removeLayer(overlay);
    coverage.clearLayers();
    const {grid:g}=result,canvas=document.createElement('canvas');
    const a=map.project([g.bounds[1],g.bounds[0]]),b=map.project([g.bounds[3],g.bounds[2]]),displayRatio=Math.max(.1,Math.abs(b.x-a.x)/g.width);
    const scale=Math.min(4,Math.max(1,displayRatio*(window.devicePixelRatio||1)),Math.sqrt(8000000/(g.width*g.height)));
    canvas.width=Math.ceil(g.width*scale);canvas.height=Math.ceil(g.height*scale);
    drawTerrain(canvas.getContext('2d'),result,scale,true,1/displayRatio);
    overlay=L.imageOverlay(canvas.toDataURL('image/png'),[[g.bounds[1],g.bounds[0]],[g.bounds[3],g.bounds[2]]],{pane:'terrainPane',interactive:false});
    if(options.visible)overlay.addTo(map);
  }
  function exportMap() {
    if(!result)return;
    const r=result,g=r.grid,scale=Math.min(3,Math.sqrt(8000000/(g.width*g.height))),w=Math.round(g.width*scale),h=Math.round(g.height*scale),header=78,footer=76;
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h+header+footer;
    const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.save();ctx.beginPath();ctx.rect(0,header,w,h);ctx.clip();ctx.translate(0,header);drawTerrain(ctx,r,scale,true,1.4/scale);
    const xy=p=>{const [x,y]=C.project(p[1],p[0]);return [(x-g.left)/g.dx*scale,(g.top-y)/g.dy*scale];};
    function line(points,color,dashed=false) {
      if(!points.length)return;ctx.beginPath();ctx.moveTo(...xy(points[0]));for(let i=1;i<points.length;i++)ctx.lineTo(...xy(points[i]));
      ctx.setLineDash(dashed?[8,6]:[]);ctx.strokeStyle='#fff';ctx.lineWidth=5;ctx.stroke();ctx.strokeStyle=color;ctx.lineWidth=2.6;ctx.stroke();ctx.setLineDash([]);
    }
    RouteCore.parts(route,routeBreaks).forEach(p=>line(p,'#0065ed'));routeGaps().forEach(gap=>line([gap.from,gap.to],'#dc2626',true));
    const placed=[];
    for(const a of annos) {
      const p=xy(a.latlng);if(p[0]<0||p[1]<0||p[0]>w||p[1]>h)continue;
      ctx.beginPath();ctx.arc(...p,5,0,Math.PI*2);ctx.fillStyle=a.color;ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=1.5;ctx.stroke();
      const label=a.text.slice(0,28);ctx.font='16px sans-serif';const tw=ctx.measureText(label).width;
      const x=Math.max(4,Math.min(w-tw-12,p[0]+8)),y=Math.max(15,Math.min(h-15,p[1]-10));
      if(placed.some(q=>Math.abs(q[1]-y)<22&&x<q[0]+q[2]+8&&x+tw>q[0]-8))continue;
      placed.push([x,y,tw]);ctx.fillStyle='rgba(255,255,255,.9)';ctx.fillRect(x-3,y-15,tw+6,22);ctx.fillStyle='#172554';ctx.fillText(label,x,y+2);
    }
    ctx.restore();ctx.fillStyle='#0f172a';ctx.font='bold 23px sans-serif';ctx.fillText((activeSource||text('地形图','Terrain map')).slice(0,70),18,30);
    ctx.font='14px sans-serif';ctx.fillText(`DEM ${Math.floor(r.min)}–${Math.ceil(r.max)} m · ${r.interval?text(`等高距 ${r.interval} m`,`Contour interval ${r.interval} m`):text('无等高线','No contours')} · WGS84`,18,56);
    ctx.fillText(sources.map(s=>s.name).join(' / ').slice(0,100),18,h+header+25);
    ctx.fillText(text('蓝线：当前路线；红色虚线：未确认连接；空白：无高程覆盖。','Blue: active route; red dashes: unconfirmed gaps; blank: no elevation coverage.'),18,h+header+47);
    const lat=(g.bounds[1]+g.bounds[3])/2*Math.PI/180,metersPerPixel=g.dx*Math.cos(lat)/scale;
    const target=w*.2*metersPerPixel,power=10**Math.floor(Math.log10(target)),meters=([5,2,1].find(k=>k*power<=target)||1)*power,bar=meters/metersPerPixel;
    ctx.strokeStyle='#0f172a';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(w-bar-24,h+header+58);ctx.lineTo(w-24,h+header+58);ctx.stroke();
    ctx.textAlign='right';ctx.fillText(meters>=1000?`${meters/1000} km`:`${meters} m`,w-24,h+header+73);
    canvas.toBlob(blob=>{if(!blob)return;const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${safeName(activeSource||'terrain')}_terrain.png`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);},'image/png');
  }
  function stopSelection() {selecting=false;firstCorner=null;map.getContainer().style.cursor='';$('demSelect').textContent=text('地图框选','Select crop on map');}
  function applySettings(saved) {
    const fresh={mode:'route',bufferKm:2,interval:20,shade:true,visible:true,auto:true,customBounds:null};
    if(saved&&typeof saved==='object') {
      if(['route','view','custom'].includes(saved.mode))fresh.mode=saved.mode;
      if(Number.isFinite(saved.bufferKm))fresh.bufferKm=Math.max(.1,Math.min(20,saved.bufferKm));
      if([0,10,20,50,100,200].includes(saved.interval))fresh.interval=saved.interval;
      for(const k of ['shade','visible','auto'])if(typeof saved[k]==='boolean')fresh[k]=saved[k];
      if(Array.isArray(saved.customBounds)&&saved.customBounds.length===4&&saved.customBounds.every(Number.isFinite))fresh.customBounds=saved.customBounds.slice();
    }
    options=fresh;expected=Array.isArray(saved?.sources)?saved.sources.filter(s=>s&&typeof s.name==='string').map(s=>({name:s.name,size:s.size,
      bounds:Array.isArray(s.bounds)&&s.bounds.length===4&&s.bounds.every(Number.isFinite)?s.bounds.slice():null})):[];
    if(sources.length&&(sources.length!==expected.length||sources.some(s=>!expected.some(e=>e.name===s.name&&e.size===s.size&&(!e.bounds||e.bounds.every((v,i)=>v===s.bounds[i])))))) {
      if(worker)worker.postMessage({type:'clear',token:++token});sources=[];
    }
    if($('demPanel')){syncControls();renderFiles();if(overlay){if(options.visible)overlay.addTo(map);else map.removeLayer(overlay);}schedule(true);}
  }
  const serializeBase=serializeProject;
  serializeProject=function(){const p=serializeBase();p.terrain={...options,sources:expected};return p;};
  const restoreBase=restoreProject;
  restoreProject=function(p){restoreBase(p);clearTimeout(timer);if(worker)worker.postMessage({type:'cancel',token:++token});setBusy(false);clearResult();signature='';applySettings(p.terrain);};
  const redrawBase=redrawActiveRoute;
  redrawActiveRoute=function(...args){const v=redrawBase(...args);if(options.mode==='route')schedule();return v;};
  const languageBase=applyLanguage;
  applyLanguage=function(){languageBase();translate();};
  function translate() {
    if(!$('demPanel'))return;
    for(const el of $('demPanel').querySelectorAll('[data-dem-zh]'))el.textContent=text(el.dataset.demZh,el.dataset.demEn);
    renderFiles();if(result)showQuality();
  }
  window.initTerrain=function() {
    const panel=document.createElement('details');panel.id='demPanel';panel.className='box tool-shared';
    panel.innerHTML=`<summary data-dem-zh="本地 DEM 地形图" data-dem-en="Local DEM terrain map"></summary>
      <p class="hint" data-dem-zh="可多选，也可分次添加不同文件夹中的 DEM。相同文件名且覆盖范围相同的 DEM 会更新。ASTER 请选 _dem.tif；_num.tif 是观测次数。" data-dem-en="Select multiple DEMs or add files from different folders in separate selections. Reselecting the same filename and coverage updates it. For ASTER, use _dem.tif; _num.tif contains observation counts."></p>
      <div id="demLaunchNotice" class="dem-launch-notice" role="alert" hidden><p data-dem-zh="当前直接打开了 HTML 文件，DEM 功能需要从本地预览地址使用。双击项目中的 start-local.command 启动预览，再点击下方链接。" data-dem-en="DEM requires the local preview address. Double-click start-local.command in the project folder to start the preview, then open the link below."></p><a href="http://127.0.0.1:8765/Trace_planner.html" target="_blank" rel="noopener" data-dem-zh="打开本地预览" data-dem-en="Open local preview"></a></div>
      <div id="demStatus" class="hint" role="status" aria-live="polite"></div>
      <label for="demInput" data-dem-zh="添加 DEM 文件（可多选）" data-dem-en="Add DEM files (multiple allowed)"></label>
      <input id="demInput" type="file" accept=".tif,.tiff" multiple aria-label="DEM GeoTIFF">
      <p class="hint" data-dem-zh="同一文件夹内可按住 ⌘（Mac）或 Ctrl（Windows）点击多份文件；跨文件夹请分次添加。" data-dem-en="In one folder, hold ⌘ (Mac) or Ctrl (Windows) to select several files; add files from other folders separately."></p>
      <ul id="demFiles" class="dem-files"></ul>
      <div class="metadata-row"><label><span data-dem-zh="裁剪范围" data-dem-en="Crop area"></span><select id="demCropMode"><option value="route" data-dem-zh="当前路线周边" data-dem-en="Around active route"></option><option value="view" data-dem-zh="当前地图视野" data-dem-en="Current map view"></option><option value="custom" data-dem-zh="地图框选范围" data-dem-en="Selected map area"></option></select></label>
      <label><span data-dem-zh="周边扩展 (km)" data-dem-en="Route buffer (km)"></span><input id="demBuffer" type="number" min="0.1" max="20" step="0.1" value="2"></label></div>
      <label><span data-dem-zh="等高线间隔" data-dem-en="Contour interval"></span><select id="demInterval"><option value="0" data-dem-zh="关闭等高线" data-dem-en="No contours"></option><option value="10">10 m</option><option value="20" selected>20 m</option><option value="50">50 m</option><option value="100">100 m</option><option value="200">200 m</option></select></label>
      <div class="dem-checks"><label><input id="demShade" type="checkbox" checked> <span data-dem-zh="地形阴影" data-dem-en="Hillshade"></span></label><label><input id="demVisible" type="checkbox" checked> <span data-dem-zh="显示地形" data-dem-en="Show terrain"></span></label><label><input id="demAuto" type="checkbox" checked> <span data-dem-zh="自动更新裁剪" data-dem-en="Update crop automatically"></span></label></div>
      <div class="btns"><button id="demSelect" type="button" data-dem-zh="地图框选" data-dem-en="Select crop on map"></button><button id="demRender" type="button" data-dem-zh="生成地形图" data-dem-en="Generate terrain"></button><button id="demCancel" type="button" disabled data-dem-zh="取消计算" data-dem-en="Cancel"></button></div>
      <div class="btns"><button id="demExport" type="button" disabled data-dem-zh="导出地形图 PNG" data-dem-en="Export terrain PNG"></button><button id="demClear" type="button" data-dem-zh="移除 DEM" data-dem-en="Remove DEM"></button></div>
      <div id="demLegend"></div>
      <p class="hint" data-dem-zh="仅处理裁剪区域；DEM 不会替换轨迹海拔。工程保存绘图参数，重新打开后需重新选择 DEM 文件。" data-dem-en="Only the crop is processed. Track elevations remain unchanged. Projects save drawing settings; reselect DEM files after reopening."></p>`;
    $('onlineSearchBox').after(panel);syncControls();translate();status('尚未导入 DEM','No DEM imported');
    if(fileMode){panel.open=true;$('demLaunchNotice').hidden=false;setBusy(false);$('demSelect').disabled=true;status('DEM 暂不可用，请先打开本地预览。','DEM unavailable; open the local preview first.',true);}
    $('demInput').onchange=e=>{
      const files=[...e.target.files];if(!files.length)return;
      try{ensureWorker().postMessage({type:'open',token:++token,files});setBusy(true);status('正在读取 DEM 元数据…','Reading DEM metadata…');}catch(err){setBusy(false);status(err.message,err.message,true);}
    };
    $('demInput').onclick=e=>{e.target.value='';};
    $('demRender').onclick=()=>render(true);$('demExport').onclick=exportMap;
    $('demCancel').onclick=()=>{clearTimeout(timer);if(worker)worker.postMessage({type:'cancel',token:++token});setBusy(false);signature='';status('已取消，可缩小范围后重试。','Cancelled; narrow the crop and retry.');};
    $('demClear').onclick=()=>{clearTimeout(timer);stopSelection();if(selection){map.removeLayer(selection);selection=null;}if(worker)worker.postMessage({type:'clear',token:++token});sources=[];expected=[];signature='';clearResult();renderFiles();setBusy(false);status('DEM 已移除','DEM removed');observeChanges();};
    for(const id of ['demCropMode','demBuffer','demInterval','demShade','demVisible','demAuto'])$(id).onchange=()=>{
      options=controls();options.bufferKm=Math.max(.1,Math.min(20,options.bufferKm||2));syncControls();
      if(overlay){if(options.visible)overlay.addTo(map);else map.removeLayer(overlay);}
      // Showing a hidden terrain should also apply any settings edited while it was hidden.
      schedule();observeChanges();
    };
    $('demSelect').onclick=()=>{
      if(selecting){stopSelection();return;}
      pickMode=false;pickBreakpoint=false;annoMode=false;selecting=true;firstCorner=null;map.getContainer().style.cursor='crosshair';
      $('demSelect').textContent=text('点击两个角点 · 再点取消','Click two corners · Click again to cancel');status('在地图点击裁剪区域的两个对角点。','Click two opposite corners of the crop on the map.');
    };
    for(const id of ['pickBtn','addAnnoBtn','mapBpBtn'])$(id).addEventListener('click',stopSelection);
    map.on('click',e=>{
      if(!selecting)return;
      if(!firstCorner){firstCorner=e.latlng;return;}
      const b=L.latLngBounds(firstCorner,e.latlng);if(b.getWest()===b.getEast()||b.getSouth()===b.getNorth()){status('请选择有面积的范围。','Select a nonzero area.');return;}
      if(selection)map.removeLayer(selection);selection=L.rectangle(b,{color:'#0f766e',weight:2,fill:false,interactive:false}).addTo(map);
      options.customBounds=[b.getWest(),b.getSouth(),b.getEast(),b.getNorth()];options.mode='custom';syncControls();stopSelection();schedule(true);observeChanges();
    });
    map.on('moveend',()=>{if(options.mode==='view')schedule();});
    map.on('zoomend',()=>{if(result)drawOverlay();});
    window.addEventListener('keydown',e=>{if(e.key==='Escape')stopSelection();});
  };
  // Read-only diagnostics also make crop size and source windows observable in integration tests.
  window.Terrain={get state(){return {sources,options,result,busy,selecting};},render,exportMap};
})();
