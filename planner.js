/* Leader planning UI and project lifecycle. No track data is sent to a server. */
const translationPairs=new Map();
function say(zh,en){translationPairs.set(zh,en);return currentLang==='en'?en:zh;}
const safeStorage={get(k){try{return localStorage.getItem(k);}catch{return null;}},set(k,v){localStorage.setItem(k,v);}};
function safeUrl(url,image=false) {
  if(typeof url!=='string')return null;
  if(image&&/^data:image\/(png|jpeg|webp|gif);base64,[a-z0-9+/=]+$/i.test(url))return url;
  try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:null;}catch{return null;}
}
function cleanAnnotation(a) {
  return {idx:Number.isInteger(a.idx)?a.idx:null,text:String(a.text||''),type:['start','end','camp','supply','risk','note','escape'].includes(a.type)?a.type:'note',
    color:/^#[0-9a-f]{6}$/i.test(a.color||'')?a.color:'#2563eb',notes:String(a.notes||''),verified:a.verified==='verified'?'verified':'unverified',
    latlng:[...a.latlng],imageData:safeUrl(a.imageData,true),imageUrl:safeUrl(a.imageUrl),linkUrl:safeUrl(a.linkUrl),
    labelLatLng:RouteCore.validPoint(a.labelLatLng)?a.labelLatLng.slice():null,fromImport:!!a.fromImport,
    importId:typeof a.importId==='string'&&/^import-[a-zA-Z0-9-]{1,100}$/.test(a.importId)?a.importId:null};
}
function elevationStat(value,heights=ele) {
  const count=heights.filter(Number.isFinite).length;
  return !count?say('未知（缺海拔）','Unknown (no elevation)'):`${Math.round(value)} m${count<heights.length?say('（部分数据）',' (partial)'):''}`;
}
function saveActiveTrackState() {
  if(route.length<2)return;
  let track=tracks.find(t=>t.id===activeTrackId);
  if(!track){track=pushImportedTrack({name:activeSource||say('工作路线','Working route'),route:route.map(p=>p.slice()),ele:[...ele],breaks:routeBreaks});activeTrackId=track.id;}
  linkImportedAnnotations(track,annos);
  Object.assign(track,{route:route.map(p=>p.slice()),ele:[...ele],breaks:[...routeBreaks],annotations:annos.map(cleanAnnotation),
    breakpoints:[...breakpoints],segmentPlans:structuredClone(segmentPlans),revision:routeRevision,role:routeRole});
}
const baseSerializeProject=serializeProject;
serializeProject=function() {
  saveActiveTrackState();
  const p=baseSerializeProject();
  p.version=3;p.breaks=[...routeBreaks];p.segmentPlans=structuredClone(segmentPlans);p.revision=routeRevision;p.role=routeRole;p.departureTime=departureTime;
  p.annotations=annos.map(cleanAnnotation);
  p.tracks=tracks.map(t=>({id:t.id,name:t.name,route:t.route,ele:t.ele,color:t.color,breaks:t.breaks||[],annotations:(t.annotations||[]).map(cleanAnnotation),
    breakpoints:t.breakpoints||[],segmentPlans:t.segmentPlans||[],revision:t.revision||1,role:t.role||'main',placemarks:t.placemarks||[],suppressedPlacemarkKeys:t.suppressedPlacemarkKeys||[]}));
  return p;
};
const baseRestoreProject=restoreProject;
restoreProject=function(p) {
  // Validate the entire document before clearing any existing state.
  RouteCore.validateProject(p);
  const incoming=structuredClone(p);
  routeBreaks=[...(incoming.breaks||[])];segmentPlans=structuredClone(incoming.segmentPlans||[]);
  routeRevision=incoming.revision||1;routeRole=incoming.role||'main';departureTime=/^\d{2}:\d{2}$/.test(incoming.departureTime||'')?incoming.departureTime:'08:00';
  baseRestoreProject(incoming);
  tracks.forEach((tr,i)=>{
    const saved=incoming.tracks[i];
    Object.assign(tr,{breaks:saved.breaks||[],annotations:(saved.annotations||[]).map(cleanAnnotation),breakpoints:saved.breakpoints||[],
      segmentPlans:saved.segmentPlans||[],revision:saved.revision||1,role:saved.role||'main'});
    linkImportedAnnotations(tr,tr.annotations);
    tr.layer.setLatLngs(RouteCore.parts(tr.route,tr.breaks));
    tr.layer.on('click',()=>{applyTrackAsActive(tr);redrawActiveRoute();renderTrackList();observeChanges();});
  });
  annos.splice(0,annos.length,...(incoming.annotations||[]).map(cleanAnnotation));
  const active=tracks.find(tr=>tr.id===activeTrackId);if(active)linkImportedAnnotations(active,annos);
  if(!activeTrackId)saveActiveTrackState();
  redrawActiveRoute(true);renderTrackList();renderPlanner();
};
const basePushTrack=pushImportedTrack;
pushImportedTrack=function(parsed) {
  const tr=basePushTrack(parsed);
  tr.layer.setLatLngs(RouteCore.parts(tr.route,tr.breaks));
  if(parsed.role)tr.role=parsed.role;if(parsed.revision)tr.revision=parsed.revision;
  return tr;
};
const baseParseGpx=parseGpxText;
parseGpxText=function(text,name) {
  const parsed=baseParseGpx(text,name),xml=new DOMParser().parseFromString(text,'text/xml');
  const extras=[...xml.getElementsByTagNameNS('https://ad0ad.github.io/trace_planner','annotation')];
  extras.forEach(el=>{
    try {const a=JSON.parse(el.textContent);if(RouteCore.validPoint(a.latlng)){
      const idx=nearestIdx({lat:a.latlng[0],lng:a.latlng[1]},parsed.route);
      a.idx=RouteCore.distance(a.latlng,parsed.route[idx])<=100?idx:null;
      if(!Number.isInteger(a.idx))a.idx=null;
      (parsed.annotations ||= []).push(cleanAnnotation(a));
      parsed.placemarks=parsed.placemarks.filter(pm=>RouteCore.distance([pm.lat,pm.lng],a.latlng)>0.1);
    }}catch{/* Foreign extensions can be ignored. */}
  });return parsed;
};
const baseParseKml=parseKmlText;
parseKmlText=function(text,name) {
  const parsed=baseParseKml(text,name),xml=new DOMParser().parseFromString(text,'text/xml');
  [...xml.getElementsByTagName('Data')].filter(el=>el.getAttribute('name')==='trace_planner_annotation').forEach(el=>{
    try {const a=JSON.parse(el.textContent);if(RouteCore.validPoint(a.latlng)){
      const idx=nearestIdx({lat:a.latlng[0],lng:a.latlng[1]},parsed.route);
      a.idx=RouteCore.distance(a.latlng,parsed.route[idx])<=100?idx:null;
      (parsed.annotations ||= []).push(cleanAnnotation(a));parsed.placemarks=parsed.placemarks.filter(pm=>RouteCore.distance([pm.lat,pm.lng],a.latlng)>0.1);
    }}catch{ }
  });return parsed;
};
// All KML files in a KMZ are read. Embedded pictures stay in the local project.
parseFile=async function(file) {
  if(!/\.(gpx|kml|kmz)$/i.test(file.name))throw Error('Unsupported file format');
  if(file.size>50*1024*1024)throw Error(say('文件超过 50 MB，请先拆分','File exceeds 50 MB; split it first'));
  if(!/\.kmz$/i.test(file.name))return /\.gpx$/i.test(file.name)?parseGpxText(await file.text(),file.name):parseKmlText(await file.text(),file.name);
  const zip=await JSZip.loadAsync(await file.arrayBuffer());
  const files=Object.values(zip.files).filter(e=>!e.dir&&/\.kml$/i.test(e.name));
  if(!files.length)throw Error('KMZ contains no KML');
  const result={name:file.name,route:[],ele:[],breaks:[],placemarks:[],annotations:[]};
  for(const entry of files) {
    const text=await entry.async('text');let parsed;
    try{parsed=parseKmlText(text,entry.name);}catch(error){
      const xml=new DOMParser().parseFromString(text,'text/xml');
      if(xml.getElementsByTagName('parsererror').length)throw error;
      const points=extractKmlPointPlacemarks(xml);
      if(!points.length||kmlLineStringCoordinateNodes(xml).length)throw error;
      parsed={route:[],ele:[],breaks:[],placemarks:points};
    }
    const offset=result.route.length;
    if(offset&&parsed.route.length)result.breaks.push(offset);
    result.breaks.push(...parsed.breaks.map(i=>offset+i));result.route.push(...parsed.route);result.ele.push(...parsed.ele);
    for(const pm of parsed.placemarks) {
      const url=pm.imageUrl;
      if(url&&!/^https?:/i.test(url)) {
        const base=entry.name.includes('/')?entry.name.slice(0,entry.name.lastIndexOf('/')+1):'';
        const path=new URL(url,'https://local.invalid/'+base).pathname.slice(1);
        const img=zip.file(decodeURIComponent(path));
        if(img&&/\.(png|jpe?g|webp|gif)$/i.test(img.name)) {
          const extension=img.name.split('.').pop().toLowerCase(),mime=extension==='jpg'?'jpeg':extension;
          pm.imageData=await compressImage(`data:image/${mime};base64,${await img.async('base64')}`);
          pm.imageUrl=null;pm.linkUrl=null;
        }
      }
      result.placemarks.push(pm);
    }
    result.annotations.push(...(parsed.annotations||[]).map(a=>({...a,idx:a.idx==null?null:a.idx+offset})));
  }
  if(result.route.length<2)throw Error('KMZ contains no valid route');
  return result;
};
const baseMergePlacemarks=mergeImportedPlacemarksIntoAnnos;
mergeImportedPlacemarksIntoAnnos=function() {
  baseMergePlacemarks();
  const tr=tracks.find(t=>t.id===activeTrackId);
  annos.forEach(a=>{if(a.fromImport){const pm=tr?.placemarks.find(pm=>a.importId?pm.importId===a.importId:placemarkSuppressionKey(pm.lat,pm.lng)===placemarkSuppressionKey(...a.latlng));if(pm?.imageData&&!a.imageData&&!a.imageUrl)a.imageData=pm.imageData;}});
  refreshAnnoMarkers();
};
let gapLayer=L.layerGroup().addTo(map);
function routeGaps(points=route,breaks=routeBreaks) {
  return breaks.map(i=>({index:i,from:points[i-1],to:points[i],meters:RouteCore.distance(points[i-1],points[i])}));
}
function drawGaps(gaps) {
  gapLayer.clearLayers();
  gaps.forEach(g=>L.polyline([g.from,g.to],{color:'#dc2626',weight:3,dashArray:'7 7'}).addTo(gapLayer)
    .bindTooltip(`${say('未确认连接','Unconfirmed connection')}: ${Math.round(g.meters)} m`));
}
const baseRenderClipList=renderClipList;
renderClipList=function() {
  baseRenderClipList();
  const result=RouteCore.stitch(clips);drawGaps(clips.length?routeGaps(result.route,result.breaks):routeGaps());
  const list=$('gapList');if(!list)return;
  list.replaceChildren();routeGaps(result.route,result.breaks).forEach((g,i)=>{
    const button=document.createElement('button');button.textContent=`${say('缺口','Gap')} ${i+1}: ${Math.round(g.meters)} m`;
    button.onclick=()=>map.fitBounds([g.from,g.to],{padding:[50,50],maxZoom:16});list.append(button);
  });
  $('gapWarning').textContent=clips.length>1?say('缺口不计入已记录里程；虚线不代表可通行道路。','Gaps are excluded from recorded distance. Dashed lines do not establish a walkable path.'):'';
};
$('addClipBtn').onclick=()=>{
  if(route.length<2)return;
  const i=Number($('startRange').value),j=Number($('endRange').value),st=segStats(i,j);
  clips.push({trackId:activeTrackId,trackName:activeSource,a:st.a,b:st.b,reverse:i>j,points:route.slice(st.a,st.b+1),
    ele:ele.slice(st.a,st.b+1),breaks:RouteCore.clipBreaks(routeBreaks,st.a,st.b),annotations:annos.map(cleanAnnotation),dist:st.dist});renderClipList();
};
$('buildBtn').onclick=()=>{
  if(!clips.length){alert(t('needClipFirst'));return;}
  const built=RouteCore.stitch(clips);
  if(built.route.length<2){alert(t('mergedTooShort'));return;}
  if(built.breaks.length&&!confirm(say(`存在 ${built.breaks.length} 处断段。保留为未确认缺口并生成路线？不会自动补成道路。`,`There are ${built.breaks.length} gaps. Build with unconfirmed gaps preserved?`)))return;
  const name=prompt(say('新路线名称','New route name'),say('拼接路线','Stitched route'));if(name===null)return;
  saveActiveTrackState();const tr=pushImportedTrack({...built,name:name.trim()||say('拼接路线','Stitched route')});
  applyTrackAsActive(tr);redrawActiveRoute();renderTrackList();
};
$('autoSplitBtn').onclick=()=>{
  if(route.length<3)return;
  const count=Math.max(2,Math.min(20,Math.round(Number($('splitCountInput').value)||5))),total=prefDist.at(-1);
  breakpoints.length=0;
  for(let k=1;k<count;k++){
    const target=total*k/count;let i=prefDist.findIndex(d=>d>=target);i=Math.min(route.length-2,Math.max(1,i));
    breakpoints.push(i);
  }
  renderBreakpointAnalysis();renderPlanner();
};
function splitAt(idx) {
  if(idx>0&&idx<route.length-1&&!breakpoints.includes(idx))breakpoints.push(idx);
  renderBreakpointAnalysis();renderPlanner();
}
let pickBreakpoint=false;
function nearestClose(latlng) {
  if(!route.length)return null;
  const idx=nearestIdx(latlng);return hav(latlng.lat,latlng.lng,...route[idx])<=100?idx:null;
}
map.on('click',e=>{
  if(pickBreakpoint){const idx=nearestClose(e.latlng);if(idx!==null){splitAt(idx);pickBreakpoint=false;$('mapBpBtn').textContent=say('地图选断点','Pick breakpoint');markDirty();}else alert(say('请点击路线附近（100 米内）','Click within 100 m of the route'));}
});
function compressImage(data) {
  return new Promise((resolve,reject)=>{
    const image=new Image();image.onload=()=>{
      const scale=Math.min(1,1280/Math.max(image.width,image.height));const canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
      canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',0.8));
    };image.onerror=()=>reject(Error('Invalid image'));image.src=data;
  });
}
pickAnnoImageData=function() {
  return new Promise(resolve=>{
    const input=document.createElement('input');input.type='file';input.accept='image/*';
    input.addEventListener('cancel',()=>resolve(null),{once:true});
    input.onchange=async()=>{const f=input.files[0];if(!f){resolve(null);return;}try{resolve(await compressImage(await fileToDataUrl(f)));}catch(e){alert(e.message);resolve(null);}};
    input.click();
  });
};
addAnno=async function(latlng) {
  if(pickBreakpoint)return;
  const idx=nearestClose(latlng),[type,color]=$('annoType').value.split('|');
  openAnnotationEditor({idx,text:'',type,color,notes:'',verified:'unverified',latlng:[latlng.lat,latlng.lng]},null);
};
editAnno=async function(i) {openAnnotationEditor(cleanAnnotation(annos[i]),i);};
function openAnnotationEditor(annotation,index) {
  const dialog=$('annotationDialog');dialog._annotation=annotation;dialog._index=index;
  $('annoNameEdit').value=annotation.text;$('annoNotesEdit').value=annotation.notes||'';$('annoTypeEdit').value=annotation.type;
  $('annoVerifiedEdit').value=annotation.verified||'unverified';$('annoLatEdit').value=annotation.latlng[0];$('annoLonEdit').value=annotation.latlng[1];
  $('annoLinkEdit').value=annotation.linkUrl||'';$('annoImageEdit').value='';$('annoRemoveImage').checked=false;
  dialog.showModal();
}
function annotationDistance(a) {return Number.isInteger(a.idx)?`${(prefDist[a.idx]/1000).toFixed(2)} km`:say('离线点 / 未关联','Off-route / unassociated');}
function revealAnnotation(annotation) {
  const index=annos.indexOf(annotation);
  if(index<0)return;
  setToolTab('analysis');
  const items=[...$('annoList').children];
  items.forEach((li,i)=>li.classList.toggle('anno-selected',i===index));
  items[index]?.scrollIntoView({behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'center',inline:'nearest'});
}
const baseRefreshAnnoMarkers=refreshAnnoMarkers;
refreshAnnoMarkers=function() {
  // URLs and text from imported documents must never become executable markup.
  annos.forEach(a=>Object.assign(a,cleanAnnotation(a)));
  baseRefreshAnnoMarkers();
  annos.forEach(a=>{
    a.marker?.on('click',()=>revealAnnotation(a));
    a.labelMarker?.on('click',()=>revealAnnotation(a));
    const content=document.createElement('div');content.innerHTML=`<b>${escapeHtmlAttr(a.text)}</b><br>${annotationDistance(a)} · ${a.verified==='verified'?say('已核实','Verified'):say('待核实','Unverified')}<br>${escapeHtmlAttr(a.notes||'').replace(/\n/g,'<br>')}${a.imageData||a.imageUrl?`<br><img src="${escapeHtmlAttr(a.imageData||a.imageUrl)}" style="max-width:220px;max-height:180px" alt="" referrerpolicy="no-referrer">`:''}${a.linkUrl?`<br><a target="_blank" rel="noopener noreferrer" href="${escapeHtmlAttr(a.linkUrl)}">${say('参考链接','Reference')}</a>`:''}`;
    const actions=document.createElement('div');actions.className='annotation-popup-actions';
    const del=document.createElement('button');del.type='button';del.className='annotation-popup-delete';
    del.textContent=say('删除路点','Delete waypoint');
    del.title=say('删除当前路点，可撤销','Delete this waypoint; undo is available');
    del.onclick=e=>{L.DomEvent.stop(e);deleteAnnotation(a);};
    actions.append(del);content.append(actions);
    a.marker?.bindPopup(content);
  });
};
const baseRenderAnnoList=renderAnnoList;
renderAnnoList=function(){baseRenderAnnoList();[...$('annoList').children].forEach((li,i)=>{
  const a=annos[i];li.querySelector('.t').textContent=`${a.text} · ${annotationDistance(a)} · ${a.verified==='verified'?say('已核实','Verified'):say('待核实','Unverified')}`;
  const b=document.createElement('button');b.textContent=say('分段','Split');b.disabled=!Number.isInteger(a.idx)||a.idx===0||a.idx===route.length-1;
  b.onclick=()=>splitAt(a.idx);li.append(b);
});};
$('clearAnnoBtn').onclick=()=>{
  if(!annos.length||!confirm(say('清空当前路线的全部标注？可撤销。','Clear all annotations on this route? Undo is available.')))return;
  const tr=tracks.find(t=>t.id===activeTrackId);if(tr)tr.suppressedPlacemarkKeys=(tr.placemarks||[]).map(placemarkImportId);
  annos.length=0;refreshAnnoMarkers();renderAnnoList();renderPlanner();
};
const xmlText=s=>String(s??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
const routeRanges=points=>{let offset=0;return RouteCore.parts(points,routeBreaks).map(part=>{const r={part,offset};offset+=part.length;return r;});};
routeToGpx=function(points,annotations,name='route') {
  const wpts=annotations.map(a=>`<wpt lat="${a.latlng[0]}" lon="${a.latlng[1]}"><name>${xmlText(a.text)}</name><desc>${xmlText(a.notes||'')}</desc><type>${xmlText(a.type)}</type><extensions><tp:annotation>${xmlText(JSON.stringify(cleanAnnotation(a)))}</tp:annotation></extensions></wpt>`).join('');
  const segments=routeRanges(points).map(({part,offset})=>`<trkseg>${part.map((p,i)=>`<trkpt lat="${p[0]}" lon="${p[1]}">${Number.isFinite(ele[offset+i])?`<ele>${ele[offset+i]}</ele>`:''}</trkpt>`).join('')}</trkseg>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><gpx version="1.1" creator="Trace Planner" xmlns="http://www.topografix.com/GPX/1/1" xmlns:tp="https://ad0ad.github.io/trace_planner"><metadata><name>${xmlText(name)}</name><desc>${xmlText(`v${routeRevision}; ${routeRole}; gaps=${routeBreaks.length}; missing elevation is omitted`)}</desc></metadata>${wpts}<trk><name>${xmlText(name)}</name>${segments}</trk></gpx>`;
};
routeToKml=function(points,annotations,name='route') {
  const lines=routeRanges(points).map(({part,offset})=>`<Placemark><name>${xmlText(name)}</name><LineString><tessellate>1</tessellate><coordinates>${part.map((p,i)=>`${p[1]},${p[0]}${Number.isFinite(ele[offset+i])?','+ele[offset+i]:''}`).join(' ')}</coordinates></LineString></Placemark>`).join('');
  const markers=annotations.map(a=>`<Placemark><name>${xmlText(a.text)}</name><description>${xmlText(a.notes||'')}</description><Style><IconStyle><color>${toKmlColor(a.color)}</color></IconStyle></Style><ExtendedData><Data name="trace_planner_annotation"><value>${xmlText(JSON.stringify(cleanAnnotation(a)))}</value></Data></ExtendedData><Point><coordinates>${a.latlng[1]},${a.latlng[0]}</coordinates></Point></Placemark>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${xmlText(name)}</name><description>${xmlText(`v${routeRevision}; ${routeRole}; gaps=${routeBreaks.length}`)}</description>${lines}${markers}</Document></kml>`;
};
routeToGeoJSON=function(points,annotations,name='route') {
  const geometry=RouteCore.parts(points,routeBreaks).map(part=>part.map(p=>[p[1],p[0]]));
  return JSON.stringify({type:'FeatureCollection',features:[{type:'Feature',properties:{name,revision:routeRevision,role:routeRole,gaps:routeBreaks.length,elevation:ele},geometry:geometry.length===1?{type:'LineString',coordinates:geometry[0]}:{type:'MultiLineString',coordinates:geometry}},...annotations.map(a=>({type:'Feature',properties:cleanAnnotation(a),geometry:{type:'Point',coordinates:[a.latlng[1],a.latlng[0]]}}))]},null,2);
};
function planRows() {
  normalizeBreakpoints();const bounds=[0,...breakpoints,route.length-1];
  if(route.length<2)return [];
  let elapsed=0;
  return bounds.slice(0,-1).map((a,i)=>{
    const b=bounds[i+1],key=`${a}:${b}`,stats=segStats(a,b);
    const existing=segmentPlans.find(p=>p.key===key);
    const waypoint=annos.find(x=>x.idx===b);
    const plan=existing||{key,name:waypoint?.text||`${say('路段','Leg')} ${i+1}`,speed:3,climbRate:400,minutes:'',rest:0,deadline:'',notes:''};
    const estimated=stats.dist/1000/Math.max(0.1,Number(plan.speed)||3)*60+stats.up/Math.max(1,Number(plan.climbRate)||400)*60;
    const manual=plan.minutes!==''&&Number.isFinite(Number(plan.minutes));
    const incomplete=stats.missing||routeBreaks.some(j=>j>a&&j<=b);
    const moving=manual?Math.max(0,Number(plan.minutes)):(incomplete?null:Math.ceil(estimated));
    elapsed=elapsed===null||moving===null?null:elapsed+moving;const arrival=elapsed;
    if(elapsed!==null)elapsed+=Math.max(0,Number(plan.rest)||0);
    return {a,b,stats,plan,moving,arrival,elapsed,incomplete,manual};
  });
}
function clockLabel(minutes) {
  if(minutes===null)return say('待补用时','Time required');
  const [h,m]=departureTime.split(':').map(Number);const value=h*60+m+minutes,day=Math.floor(value/1440);
  return `${day?`+${day}d `:''}${String(Math.floor(value/60)%24).padStart(2,'0')}:${String(Math.floor(value)%60).padStart(2,'0')}`;
}
function deadlineLate(row) {
  if(row.arrival===null||!/^\d{2}:\d{2}$/.test(row.plan.deadline))return false;
  const [h,m]=departureTime.split(':').map(Number),[dh,dm]=row.plan.deadline.split(':').map(Number);
  // Deadline is on departure day; use a manual note for overnight decision points.
  return h*60+m+row.arrival>dh*60+dm;
}
function renderPlanner() {
  if(!$('leaderPlanner'))return;
  $('routeNameInput').value=activeSource||'';$('routeRoleSelect').value=routeRole;$('routeRevisionInput').value=routeRevision;
  $('departureInput').value=departureTime;
  $('routeQuality').textContent=route.length?say(`海拔有效点 ${ele.filter(Number.isFinite).length}/${route.length}；未确认连接 ${routeBreaks.length} 处。缺失海拔不会自动补造。`,`Elevation available at ${ele.filter(Number.isFinite).length}/${route.length} points; ${routeBreaks.length} unconfirmed gaps. Missing measurements are not fabricated.`):say('请先导入路线','Import a route first');
  const tbody=$('planTbody');tbody.replaceChildren();
  planRows().forEach(row=>{
    const tr=document.createElement('tr');
    const first=document.createElement('td');const name=document.createElement('input');name.value=row.plan.name;name.setAttribute('aria-label',say('路段名称','Leg name'));
    name.onchange=()=>updatePlan(row,'name',name.value);first.append(name);
    const locate=document.createElement('button');locate.textContent=say('定位','Locate');locate.onclick=()=>map.fitBounds(route.slice(row.a,row.b+1),{padding:[40,40]});first.append(locate);tr.append(first);
    const data=document.createElement('td');data.textContent=`${(row.stats.dist/1000).toFixed(2)} km / ↑${elevationStat(row.stats.up,ele.slice(row.a,row.b+1))} / ↓${elevationStat(row.stats.down,ele.slice(row.a,row.b+1))}\n${say('累计','Cumulative')} ${(prefDist[row.b]/1000).toFixed(2)} km`;tr.append(data);
    const time=document.createElement('td');
    for(const [key,label,step] of [['speed',say('速度 km/h','Speed km/h'),0.1],['climbRate',say('爬升 m/h','Climb m/h'),10],['minutes',say('手填用时 min','Override min'),1],['rest',say('休息 min','Rest min'),1]]){
      const el=document.createElement('input');el.type='number';el.min=key==='speed'?0.1:0;el.step=step;el.value=row.plan[key];el.placeholder=label;el.setAttribute('aria-label',label);el.title=label;
      const wrapper=document.createElement('label');wrapper.textContent=label;wrapper.append(el);time.append(wrapper);
      el.onchange=()=>updatePlan(row,key,el.value);
    }tr.append(time);
    const end=document.createElement('td');end.append(document.createTextNode(`${clockLabel(row.arrival)} ${say('到达','arrive')} / ${clockLabel(row.elapsed)} ${say('离开','depart')}`));
    if(row.incomplete){const warning=document.createElement('div');warning.className='warn';warning.textContent=say('估算不完整：海拔缺失或存在缺口','Incomplete estimate: elevation missing or route gaps');end.append(warning);}
    const deadline=document.createElement('input');deadline.type='time';deadline.value=row.plan.deadline;deadline.title=say('最晚通过时间（出发当天）','Latest passage time (departure day)');deadline.setAttribute('aria-label',deadline.title);
    const label=document.createElement('label');label.textContent=say('最晚通过','Latest passage');label.append(deadline);end.append(label);deadline.onchange=()=>updatePlan(row,'deadline',deadline.value);
    if(deadlineLate(row)){const w=document.createElement('div');w.className='warn';w.textContent=say('预计超过最晚时间，请调整或考虑下撤','ETA exceeds deadline; revise plan or consider escape');end.append(w);}
    const notes=document.createElement('textarea');notes.rows=2;notes.value=row.plan.notes;notes.placeholder=say('路况、下撤去向、交通、决策条件','Terrain, escape destination, transport, decision conditions');notes.setAttribute('aria-label',notes.placeholder);notes.onchange=()=>updatePlan(row,'notes',notes.value);end.append(notes);tr.append(end);tbody.append(tr);
  });
  drawGaps(routeGaps());
}
function updatePlan(row,key,value) {
  let p=segmentPlans.find(p=>p.key===row.plan.key);
  if(!p){p={...row.plan};segmentPlans.push(p);}
  p[key]=value;renderPlanner();markDirty();
}
const baseRenderBreakpointAnalysis=renderBreakpointAnalysis;
renderBreakpointAnalysis=function() {
  baseRenderBreakpointAnalysis();
  const rows=[...$('bpSegTbody').children];rows.forEach((tr,i)=>{
    const bounds=[0,...breakpoints,route.length-1],a=bounds[i],b=bounds[i+1];
    tr.children[1].textContent=`${(prefDist[a]/1000).toFixed(2)} – ${(prefDist[b]/1000).toFixed(2)} km`;
    const st=segStats(a,b);tr.children[3].textContent=elevationStat(st.up,ele.slice(a,b+1));tr.children[4].textContent=elevationStat(st.down,ele.slice(a,b+1));
    tr.title=say('点击定位路段','Click to locate this leg');tr.onclick=()=>map.fitBounds(route.slice(a,b+1),{padding:[40,40]});
  });
  renderPlanner();
};
let dirty=false,draftTimer=null,history=[],redoHistory=[],lastSnapshot=null,restoringHistory=false;
function snapshot() {const p=serializeProject();delete p.savedAt;return JSON.stringify(p);}
function observeChanges() {
  if(restoringHistory)return;
  const current=snapshot();if(current===lastSnapshot)return;
  if(lastSnapshot){history.push(lastSnapshot);if(history.length>20)history.shift();redoHistory=[];}
  lastSnapshot=current;markDirty();
}
function markDirty() {
  dirty=true;
  if($('saveStatus'))$('saveStatus').textContent=say('已修改 · 正在保存草稿…','Changed · Saving draft…');
  clearTimeout(draftTimer);draftTimer=setTimeout(()=>{
    try{const raw=JSON.stringify(serializeProject());if(new Blob([raw]).size>LS_PROJECT_MAX_BYTES)throw Error('quota');safeStorage.set('trace_planner_draft_v3',raw);
      $('saveStatus').textContent=say('草稿已保存在本浏览器 · 分享前请下载工程','Draft saved in this browser · Download project before sharing');
    }catch{$('saveStatus').textContent=say('草稿未保存（空间不足或浏览器限制），请下载工程','Draft not saved (storage full or restricted); download the project');}
  },500);
}
function historyMove(undo) {
  observeChanges();const from=undo?history:redoHistory,to=undo?redoHistory:history;if(!from.length)return;
  const current=snapshot(),next=from.pop();restoringHistory=true;
  try{restoreProject(JSON.parse(next));to.push(current);lastSnapshot=snapshot();markDirty();}finally{restoringHistory=false;}
}
function confirmReplace() {return !dirty||confirm(say('当前工程已修改。打开会替换当前内容，是否继续？建议先下载工程。','The project has changes. Opening replaces it. Continue? Download a backup first.'));}
const baseLoadJson=loadProjectFromJsonText;
loadProjectFromJsonText=function(txt,silent) {
  const p=JSON.parse(txt);RouteCore.validateProject(p);if(!silent&&!confirmReplace())return;
  restoreProject(p);dirty=false;observeChanges();dirty=false;if(!silent)alert(t('openedProject'));
};
function printRoadbook() {
  if(route.length<2){alert(t('noRouteAnalyze'));return;}
  const book=$('roadbook');book.replaceChildren();
  const heading=document.createElement('h1');heading.textContent=`${activeSource} · v${routeRevision}`;book.append(heading);
  const summary=document.createElement('p');summary.textContent=`${say('路线用途','Role')}: ${roleLabel(routeRole)} | ${say('出发','Departure')}: ${departureTime} | ${(prefDist.at(-1)/1000).toFixed(2)} km | ↑${elevationStat(prefUp.at(-1))} | ↓${elevationStat(prefDown.at(-1))} | ${say('未确认缺口','Unconfirmed gaps')}: ${routeBreaks.length}`;book.append(summary);
  const note=document.createElement('p');note.textContent=say('时间估算 = 距离 ÷ 平地速度 + 爬升 ÷ 爬升速度 + 休息。请结合队伍和路况调整。虚线连接未经核实，不代表道路；底图不包含在打印稿中。','Estimate = distance / speed + ascent / climb rate + rests. Adjust for your group and terrain. Dashed gaps are unverified. Basemap tiles are not included.');book.append(note);
  book.append(createRouteSketch());
  const profile=$('liveProfileCanvas');if(ele.some(Number.isFinite)){const img=document.createElement('img');img.src=profile.toDataURL();img.className='print-profile';book.append(img);}
  const table=document.createElement('table');table.innerHTML=`<thead><tr><th>${say('路段','Leg')}</th><th>${say('里程 / 爬升 / 下降','Distance / ascent / descent')}</th><th>${say('到达 / 离开','Arrive / depart')}</th><th>${say('休息 / 最晚通过 / 备注','Rest / deadline / notes')}</th></tr></thead>`;
  const tbody=document.createElement('tbody');planRows().forEach(r=>{const tr=document.createElement('tr');
    [r.plan.name,`${(r.stats.dist/1000).toFixed(2)} km / ↑${elevationStat(r.stats.up,ele.slice(r.a,r.b+1))} / ↓${elevationStat(r.stats.down,ele.slice(r.a,r.b+1))}`,`${clockLabel(r.arrival)} / ${clockLabel(r.elapsed)}${r.incomplete?say('（估算不完整）',' (incomplete)'):''}`,`${r.plan.rest} min / ${r.plan.deadline||'—'}${deadlineLate(r)?say('（预计超时）',' (late)'):''}\n${r.plan.notes}`].forEach(text=>{const td=document.createElement('td');td.textContent=text;tr.append(td);});tbody.append(tr);
  });table.append(tbody);book.append(table);
  const points=document.createElement('h2');points.textContent=say('关键点与核实记录','Waypoints and verification');book.append(points);
  annos.forEach((a,i)=>{const p=document.createElement('p');p.textContent=`#${i+1} ${a.text} | ${annotationDistance(a)} | ${a.latlng.map(v=>v.toFixed(6)).join(', ')} | ${a.verified==='verified'?say('已核实','Verified'):say('待核实','Unverified')}\n${a.notes||''}${a.linkUrl?'\n'+a.linkUrl:''}`;book.append(p);});
  const other=tracks.filter(t=>t.id!==activeTrackId);if(other.length){const p=document.createElement('p');p.textContent=say('同工程备选路线：','Other routes in this project: ')+other.map(t=>`${t.name} (${roleLabel(t.role)}, v${t.revision||1})`).join('；');book.append(p);}
  window.print();
}
function createRouteSketch() {
  const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 900 480');svg.setAttribute('class','route-sketch');
  const bounds=[...route,...annos.map(a=>a.latlng)].reduce((b,p)=>[Math.min(b[0],p[0]),Math.max(b[1],p[0]),Math.min(b[2],p[1]),Math.max(b[3],p[1])],[Infinity,-Infinity,Infinity,-Infinity]);
  const cos=Math.cos((bounds[0]+bounds[1])/2*Math.PI/180),spanX=Math.max(1e-6,(bounds[3]-bounds[2])*cos),spanY=Math.max(1e-6,bounds[1]-bounds[0]),scale=Math.min(820/spanX,400/spanY);
  const xy=p=>[40+(820-spanX*scale)/2+(p[1]-bounds[2])*cos*scale,40+(400-spanY*scale)/2+(bounds[1]-p[0])*scale];
  const line=(points,dashed)=>{const el=document.createElementNS(ns,'polyline');el.setAttribute('points',points.map(p=>xy(p).join(',')).join(' '));el.setAttribute('fill','none');el.setAttribute('stroke',dashed?'#b91c1c':'#0f766e');el.setAttribute('stroke-width','3');if(dashed)el.setAttribute('stroke-dasharray','8 6');svg.append(el);};
  RouteCore.parts(route,routeBreaks).forEach(p=>line(p));routeGaps().forEach(g=>line([g.from,g.to],true));
  const placed=[];
  annos.forEach((a,i)=>{const [x,y]=xy(a.latlng);let ly=y-6;while(placed.some(p=>Math.abs(p[0]-x)<40&&Math.abs(p[1]-ly)<15))ly-=16;placed.push([x,ly]);const text=document.createElementNS(ns,'text');text.setAttribute('x',x);text.setAttribute('y',Math.max(15,ly));text.setAttribute('font-size','13');text.textContent=`#${i+1}`;svg.append(text);const dot=document.createElementNS(ns,'circle');dot.setAttribute('cx',x);dot.setAttribute('cy',y);dot.setAttribute('r','4');dot.setAttribute('fill',a.color);svg.append(dot);});
  const north=document.createElementNS(ns,'text');north.setAttribute('x','20');north.setAttribute('y','25');north.textContent='N ↑';svg.append(north);return svg;
}
function roleLabel(role){return {main:say('主线','Main'),alternative:say('备选','Alternative'),escape:say('下撤','Escape')}[role]||role;}
// Measure at the view's centre latitude, as a Mercator map's scale varies with latitude.
const MapScaleControl=L.Control.extend({
  options:{position:'bottomleft'},
  onAdd(map) {
    this._box=L.DomUtil.create('div','map-scale');
    this._box.setAttribute('role','img');
    this._bar=L.DomUtil.create('div','map-scale-bar',this._box);
    for(let i=0;i<6;i++)L.DomUtil.create('i','',this._bar);
    const labels=L.DomUtil.create('div','map-scale-labels',this._box);
    this._labels=Array.from({length:4},(_,i)=>{const label=L.DomUtil.create('span','',labels);label.style.left=`${i*100/3}%`;return label;});
    map.on('move resize',this.update,this);
    map.whenReady(this.update,this);
    return this._box;
  },
  onRemove(map){map.off('move resize',this.update,this);},
  update() {
    const map=this._map,size=map.getSize(),world=map.getPixelWorldBounds();
    // Keep the ruler within the viewport and below half a world to avoid wrap ambiguity.
    const maxWidth=Math.min(260,size.x*.65,size.x-56,world?world.getSize().x*.45:260);
    if(maxWidth<=0){this._box.hidden=true;return;}
    this._box.hidden=false;
    const distance=width=>map.distance(map.containerPointToLatLng([size.x/2-width/2,size.y/2]),map.containerPointToLatLng([size.x/2+width/2,size.y/2]));
    const target=distance(maxWidth)/3;
    if(!Number.isFinite(target)||target<=0){this._box.hidden=true;return;}
    const power=10**Math.floor(Math.log10(target));
    const step=([5,3,2,1].find(n=>n*power<=target)||1)*power,total=step*3;
    // Invert the distance measurement, including wide views where metres/pixel is nonlinear.
    let low=0,high=maxWidth;
    for(let i=0;i<20;i++){const mid=(low+high)/2;if(distance(mid)<total)low=mid;else high=mid;}
    const width=(low+high)/2;
    this._bar.style.width=`${width}px`;
    this._box.classList.toggle('map-scale-compact',width<160);
    const unit=total>=1000?'km':'m',divisor=unit==='km'?1000:1;
    const decimals=Math.max(0,-Math.floor(Math.log10(step/divisor)));
    this._labels.forEach((label,i)=>{label.textContent=i===0?'0':`${(i*step/divisor).toFixed(decimals)} ${unit}`;});
    const description=say('比例尺（按地图中心纬度计算）','Scale (at the map centre latitude)');
    this._box.title=description;
    this._box.setAttribute('aria-label',`${description}: ${this._labels.at(-1).textContent}`);
  }
});
let mapScaleControl=null;
function initPlanner() {
  const css=document.createElement('link');css.rel='stylesheet';css.href='planner.css';document.head.append(css);
  mapScaleControl=new MapScaleControl().addTo(map);
  // Printing temporarily hides the map; refresh its geometry when the layout returns.
  const mapSizeObserver=new ResizeObserver(()=>map.invalidateSize());
  mapSizeObserver.observe(map.getContainer());
  map.once('unload',()=>mapSizeObserver.disconnect());
  const status=document.createElement('div');status.innerHTML=`<div class="btns"><button id="undoBtn">${say('撤销','Undo')}</button><button id="redoBtn">${say('重做','Redo')}</button><button id="restoreDraftBtn">${say('恢复草稿','Restore draft')}</button></div><div class="hint" id="saveStatus">${say('草稿将在编辑后自动保存','Drafts save automatically after edits')}</div>`;
  $('projectDropZone').after(status);
  const gaps=document.createElement('div');gaps.id='gapList';gaps.className='btns';$('gapWarning').after(gaps);
  const button=document.createElement('button');button.id='mapBpBtn';button.textContent=say('地图选断点','Pick breakpoint');$('addBpBtn').after(button);
  button.onclick=()=>{pickMode=false;annoMode=false;pickBreakpoint=!pickBreakpoint;button.textContent=pickBreakpoint?say('点击路线选断点 · 再点取消','Click route · Click again to cancel'):say('地图选断点','Pick breakpoint');};
  const option=document.createElement('option');option.value='escape|#be123c';option.textContent=say('下撤点','Escape point');$('annoType').append(option);
  const planner=document.createElement('div');planner.id='leaderPlanner';planner.className='box tool-shared';
  planner.innerHTML=`<b>${say('领队行程与路书','Leader itinerary & roadbook')}</b><div class="row"><label>${say('路线名称','Route name')}<input id="routeNameInput"></label></div><div class="metadata-row"><label>${say('用途','Role')}<select id="routeRoleSelect"><option value="main">${say('主线','Main')}</option><option value="alternative">${say('备选','Alternative')}</option><option value="escape">${say('下撤','Escape')}</option></select></label><label>${say('版本','Revision')}<input id="routeRevisionInput" type="number" min="1" step="1"></label><label>${say('出发时间','Departure')}<input id="departureInput" type="time" value="08:00"></label></div><div class="hint" id="routeQuality"></div><div class="hint">${say('用时 = 距离 ÷ 平地速度 + 爬升 ÷ 爬升速度；休息另计。可手填覆盖用时。最晚通过时间按出发当天计算。','Moving time = distance / speed + ascent / climb rate. Rests are additional. Override time as needed. Deadlines are on the departure day.')}</div><div class="table-scroll"><table class="plan-table"><thead><tr><th>${say('路段','Leg')}</th><th>${say('距离 / 爬升 / 下降','Distance / ascent / descent')}</th><th>${say('用时参数','Timing')}</th><th>${say('到达与决策','Arrival & decisions')}</th></tr></thead><tbody id="planTbody"></tbody></table></div><div class="btns"><button id="duplicateRouteBtn">${say('复制为备选路线','Duplicate as alternative')}</button><button id="printRoadbookBtn">${say('打印路书 / 保存 PDF','Print roadbook / Save PDF')}</button><button id="exportPlanBtn">${say('导出行程 CSV','Export itinerary CSV')}</button></div>`;
  $('panel').append(planner);
  const dialog=document.createElement('dialog');dialog.id='annotationDialog';
  dialog.innerHTML=`<form id="annotationForm"><h2>${say('编辑路线关键点','Edit waypoint')}</h2><label>${say('名称','Name')}<input id="annoNameEdit" required maxlength="200"></label><label>${say('类型','Type')}<select id="annoTypeEdit">${['start','end','camp','supply','risk','note','escape'].map(k=>`<option value="${k}">${{start:say('起点','Start'),end:say('终点','End'),camp:say('营地','Camp'),supply:say('水源 / 补给','Water / Supply'),risk:say('风险','Risk'),note:say('普通','Note'),escape:say('下撤','Escape')}[k]}</option>`).join('')}</select></label><label>${say('核实状态','Verification')}<select id="annoVerifiedEdit"><option value="unverified">${say('待核实','Unverified')}</option><option value="verified">${say('已核实','Verified')}</option></select></label><div class="metadata-row"><label>${say('纬度','Latitude')}<input id="annoLatEdit" type="number" min="-90" max="90" step="any" required></label><label>${say('经度','Longitude')}<input id="annoLonEdit" type="number" min="-180" max="180" step="any" required></label></div><label>${say('备注（水源可靠性、下撤去向、交通、核实日期等）','Notes (water reliability, escape destination, transport, verification date)')}<textarea id="annoNotesEdit" rows="4" maxlength="5000"></textarea></label><label>${say('参考链接','Reference URL')}<input id="annoLinkEdit" type="url"></label><label>${say('替换 / 添加图片','Replace / add image')}<input id="annoImageEdit" type="file" accept="image/*"></label><label><input id="annoRemoveImage" type="checkbox"> ${say('删除图片','Remove image')}</label><div class="btns"><button type="submit">${say('保存','Save')}</button><button type="button" id="cancelAnnoEdit">${say('取消','Cancel')}</button></div></form>`;
  document.body.append(dialog);const book=document.createElement('article');book.id='roadbook';document.body.append(book);
  $('cancelAnnoEdit').onclick=()=>dialog.close();
  $('annotationForm').onsubmit=async e=>{
    e.preventDefault();const a=dialog._annotation,index=dialog._index,location=[Number($('annoLatEdit').value),Number($('annoLonEdit').value)];
    if(!RouteCore.validPoint(location))return;const type=$('annoTypeEdit').value,colors={start:'#16a34a',end:'#dc2626',camp:'#2563eb',supply:'#f59e0b',risk:'#7c3aed',note:'#111827',escape:'#be123c'};
    const nearest=nearestIdx({lat:location[0],lng:location[1]});
    Object.assign(a,{text:$('annoNameEdit').value.trim(),notes:$('annoNotesEdit').value,type,color:colors[type],verified:$('annoVerifiedEdit').value,latlng:location,
      idx:RouteCore.distance(location,route[nearest])<=100?nearest:null,linkUrl:safeUrl($('annoLinkEdit').value),labelLatLng:null});
    if($('annoRemoveImage').checked){a.imageData=null;a.imageUrl=null;}
    const file=$('annoImageEdit').files[0];if(file){try{a.imageData=await compressImage(await fileToDataUrl(file));a.imageUrl=null;}catch(err){alert(err.message);return;}}
    if(index===null)annos.push(a);else annos[index]=a;
    dialog.close();refreshAnnoMarkers();renderAnnoList();renderPlanner();observeChanges();
  };
  $('routeNameInput').onchange=e=>{if(route.length<2)return;activeSource=e.target.value.trim()||say('未命名路线','Untitled route');const tr=tracks.find(t=>t.id===activeTrackId);if(tr)tr.name=activeSource;updateStats();renderTrackList();};
  $('routeRoleSelect').onchange=e=>{routeRole=e.target.value;renderTrackList();};
  $('routeRevisionInput').onchange=e=>{routeRevision=Math.max(1,Math.round(Number(e.target.value)||1));};
  $('departureInput').onchange=e=>{departureTime=e.target.value||'08:00';renderPlanner();};
  $('duplicateRouteBtn').onclick=()=>{
    if(route.length<2)return;saveActiveTrackState();const copy=pushImportedTrack({name:activeSource+say('（备选）',' (alternative)'),route:route.map(p=>p.slice()),ele:[...ele],breaks:[...routeBreaks],annotations:annos.map(cleanAnnotation),role:'alternative'});
    copy.breakpoints=[...breakpoints];copy.segmentPlans=structuredClone(segmentPlans);applyTrackAsActive(copy);redrawActiveRoute();renderTrackList();
  };
  $('printRoadbookBtn').onclick=printRoadbook;
  $('exportPlanBtn').onclick=()=>{
    if(route.length<2)return;const cell=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
    const rows=[[say('路段','Leg'),'km','ascent_m','descent_m','moving_min','rest_min','arrival','departure','deadline','notes','quality'],...planRows().map(r=>[r.plan.name,(r.stats.dist/1000).toFixed(2),elevationStat(r.stats.up,ele.slice(r.a,r.b+1)),elevationStat(r.stats.down,ele.slice(r.a,r.b+1)),r.moving,r.plan.rest,clockLabel(r.arrival),clockLabel(r.elapsed),r.plan.deadline,r.plan.notes,r.incomplete?'incomplete':'recorded'])];
    // Spreadsheet formula prefixes in free text are neutralized.
    downloadText(`${safeName(activeSource)}_v${routeRevision}_itinerary.csv`,'\ufeff'+rows.map(row=>row.map(v=>cell(/^[=+@-]/.test(String(v))?"'"+v:v)).join(',')).join('\r\n'),'text/csv;charset=utf-8');
  };
  $('undoBtn').onclick=()=>historyMove(true);$('redoBtn').onclick=()=>historyMove(false);
  $('restoreDraftBtn').onclick=()=>{const raw=safeStorage.get('trace_planner_draft_v3');if(!raw){alert(say('没有自动草稿','No automatic draft'));return;}try{loadProjectFromJsonText(raw,false);}catch(e){alert(e.message);}};
  $('liveProfileCanvas').addEventListener('click',e=>{
    if(route.length<3)return;const rect=e.currentTarget.getBoundingClientRect(),x=(e.clientX-rect.left)/rect.width*e.currentTarget.width;
    const target=Math.max(0,Math.min(1,(x-44)/(e.currentTarget.width-56)))*prefDist.at(-1);let idx=prefDist.findIndex(d=>d>=target);splitAt(idx);observeChanges();
  });
  document.addEventListener('click',()=>setTimeout(observeChanges,0));document.addEventListener('change',()=>setTimeout(observeChanges,0));
  document.addEventListener('input',()=>{clearTimeout(window.changeObserveTimer);window.changeObserveTimer=setTimeout(observeChanges,350);});
  window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
  const baseSave=$('saveProjectBtn').onclick;$('saveProjectBtn').onclick=()=>{baseSave();dirty=false;$('saveStatus').textContent=say('工程已下载','Project downloaded');};
  const exportButtons=['exportGpxBtn','exportKmlBtn','exportGeoBtn'];exportButtons.forEach(id=>{const handler=$(id).onclick;$(id).onclick=()=>{if(routeBreaks.length&&!confirm(say('路线包含未确认缺口，导出将保留断段。请在导航软件中检查断段显示。继续？','Route has unconfirmed gaps. Export preserves separate segments. Check your navigation app. Continue?')))return;handler();};});
  $('trackInput').addEventListener('change',()=>{setTimeout(observeChanges,800);});
  // Clicking a track on the map makes selection direct; imported paths remain independently visible.
  const originalPush=pushImportedTrack;pushImportedTrack=function(parsed){const tr=originalPush(parsed);tr.layer.on('click',()=>{applyTrackAsActive(tr);redrawActiveRoute();renderTrackList();observeChanges();});return tr;};
  lastSnapshot=snapshot();renderPlanner();renderClipList();
  const draft=safeStorage.get('trace_planner_draft_v3');if(draft)$('saveStatus').textContent=say('发现自动草稿，可点「恢复草稿」','Automatic draft found; use Restore draft');
  if('serviceWorker' in navigator&&location.protocol!=='file:')navigator.serviceWorker.register('sw.js').catch(()=>{});
}
// Keep selection and deletion explicit: a deleted active route must not be recreated by autosave.
syncAnalysisTargetUI=function() {
  $('analysisTargetName').textContent=activeSource||t('sourceUnknown');const select=$('analysisTrackSelect');select.replaceChildren();
  tracks.forEach(tr=>{const option=document.createElement('option');option.value=tr.id;option.textContent=`${tr.name} · ${roleLabel(tr.id===activeTrackId?routeRole:tr.role)} · v${tr.id===activeTrackId?routeRevision:tr.revision||1}`;select.append(option);});select.value=activeTrackId||'';
};
renderTrackList=function() {
  const list=$('trackList');list.replaceChildren();
  tracks.forEach(tr=>{
    const li=document.createElement('li'),text=document.createElement('span');text.className='t';text.style.color=/^#[0-9a-f]{6}$/i.test(tr.color)?tr.color:'#2563eb';
    text.textContent=`${tr.name} · ${roleLabel(tr.id===activeTrackId?routeRole:tr.role)} · v${tr.id===activeTrackId?routeRevision:tr.revision||1}${tr.id===activeTrackId?' '+t('currentAnalyzingTag'):''}`;
    const select=document.createElement('button');select.textContent=t('setAsAnalysis');select.onclick=()=>{applyTrackAsActive(tr);redrawActiveRoute();renderTrackList();};
    const remove=document.createElement('button');remove.textContent=t('remove');remove.onclick=()=>{
      if(!confirm(say(`移除「${tr.name}」？可以撤销。`,`Remove “${tr.name}”? Undo is available.`)))return;
      saveActiveTrackState();importedLayer.removeLayer(tr.layer);tracks.splice(tracks.indexOf(tr),1);
      if(activeTrackId===tr.id){activeTrackId=null;route=[];ele=[];routeBreaks=[];segmentPlans=[];breakpoints.length=0;annos.length=0;activeSource='';
        if(tracks.length)applyTrackAsActive(tracks[0]);else {prefDist=[];prefUp=[];prefDown=[];}redrawActiveRoute();}
      renderTrackList();updateStats();renderPlanner();
    };li.append(text,select,remove);list.append(li);
  });syncAnalysisTargetUI();
};
const baseApplyLanguage=applyLanguage;
applyLanguage=function() {
  baseApplyLanguage();
  const lookup=new Map();for(const [zh,en] of translationPairs){lookup.set(currentLang==='en'?zh:en,currentLang==='en'?en:zh);}
  for(const selector of ['#leaderPlanner','#annotationDialog','#mapBpBtn','#gapList','#undoBtn','#redoBtn','#restoreDraftBtn','#saveStatus']) {
    const el=document.querySelector(selector);if(!el)continue;
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode())){const key=node.textContent.trim();if(lookup.has(key))node.textContent=node.textContent.replace(key,lookup.get(key));}
    el.querySelectorAll('[placeholder],[title],[aria-label]').forEach(n=>{for(const key of ['placeholder','title','aria-label'])if(lookup.has(n.getAttribute(key)))n.setAttribute(key,lookup.get(n.getAttribute(key)));});
  }
  const escapeOption=$('annoType').querySelector('[value="escape|#be123c"]');if(escapeOption)escapeOption.textContent=say('下撤点','Escape point');
  const hint=document.querySelector('#liveProfileCanvas').parentElement.nextElementSibling;if(hint)hint.textContent=say('点击高度图可添加分段断点；起终点随地图与滑块同步。','Click the profile to add a breakpoint. Endpoints follow map and sliders.');
  const head=$('bpSegTbody').closest('table').querySelector('thead th:nth-child(2)');if(head)head.textContent=say('里程范围','Distance range');
  renderPlanner();renderTrackList();
  if(mapScaleControl)mapScaleControl.update();
};
$('pickBtn').onclick=()=>{
  if(route.length<2)return;
  pickBreakpoint=false;annoMode=false;pickMode=!pickMode;pickCount=0;$('pickBtn').textContent=pickMode?t('pickStart'):t('pickStartEnd');
};
const baseAnnoButton=$('addAnnoBtn').onclick;
$('addAnnoBtn').onclick=()=>{if(route.length<2)return;pickMode=false;pickBreakpoint=false;baseAnnoButton();};
window.addEventListener('keydown',e=>{if(e.key==='Escape'){pickMode=false;pickBreakpoint=false;annoMode=false;$('pickBtn').textContent=t('pickStartEnd');$('addAnnoBtn').textContent=t('addAnno');if($('mapBpBtn'))$('mapBpBtn').textContent=say('地图选断点','Pick breakpoint');}});
let wasNarrow=window.matchMedia('(max-width:900px)').matches;
window.addEventListener('resize',()=>{const narrow=window.matchMedia('(max-width:900px)').matches;if(narrow!==wasNarrow){wasNarrow=narrow;renderLayerControl();}});
exportElevationChartPng=function() {
  if(!ele.some(Number.isFinite)){alert(t('noEle'));return;}
  const canvas=document.createElement('canvas');canvas.width=2200;canvas.height=1200;
  const ctx=canvas.getContext('2d'),known=ele.filter(Number.isFinite),min=known.reduce((a,b)=>Math.min(a,b),Infinity),max=known.reduce((a,b)=>Math.max(a,b),-Infinity);
  const total=prefDist.at(-1)||1,x=i=>140+prefDist[i]/total*2000,y=v=>1040-(v-min)/Math.max(1,max-min)*840;
  ctx.fillStyle='#fff';ctx.fillRect(0,0,2200,1200);ctx.font='30px sans-serif';ctx.fillStyle='#111827';
  ctx.fillText(`${activeSource} · v${routeRevision}`,140,50);ctx.fillText(`${(total/1000).toFixed(2)} km | ↑${elevationStat(prefUp.at(-1))} | ↓${elevationStat(prefDown.at(-1))} | ${routeBreaks.length} ${say('未确认缺口','unconfirmed gaps')}`,140,95);
  ctx.strokeStyle='#e2e8f0';ctx.lineWidth=2;
  for(let k=0;k<=5;k++){const v=min+(max-min)*k/5,yy=y(v);ctx.beginPath();ctx.moveTo(140,yy);ctx.lineTo(2140,yy);ctx.stroke();ctx.fillText(`${Math.round(v)} m`,10,yy+10);}
  ctx.beginPath();for(let i=0;i<route.length;i++){if(!Number.isFinite(ele[i]))continue;if(i===0||!Number.isFinite(ele[i-1])||routeBreaks.includes(i))ctx.moveTo(x(i),y(ele[i]));else ctx.lineTo(x(i),y(ele[i]));}ctx.strokeStyle='#0f766e';ctx.lineWidth=4;ctx.stroke();
  ctx.fillStyle='#111827';for(let k=0;k<=10;k++)ctx.fillText(`${(total/1000*k/10).toFixed(1)}`,120+2000*k/10,1100);
  ctx.fillText(say('距离 (km) · 空白处为缺海拔或断段','Distance (km) · Blank sections indicate missing elevation or route gaps'),140,1160);
  downloadPngFromCanvas(`${safeName(activeSource)}_v${routeRevision}_elevation.png`,canvas);
};
const baseRefreshSafeMarkers=refreshAnnoMarkers;
refreshAnnoMarkers=function(){baseRefreshSafeMarkers();annos.forEach(a=>a.labelMarker?.on('dragend',()=>observeChanges()));};
