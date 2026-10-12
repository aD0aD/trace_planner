/* Route geometry and elevation calculations, shared by the application and tests. */
(function(root) {
  const validPoint=p=>Array.isArray(p)&&p.length>=2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&Math.abs(p[0])<=90&&Math.abs(p[1])<=180;
  function distance(a,b) {
    const r=Math.PI/180,dl=(b[0]-a[0])*r,dn=(b[1]-a[1])*r;
    const h=Math.sin(dl/2)**2+Math.cos(a[0]*r)*Math.cos(b[0]*r)*Math.sin(dn/2)**2;
    return 12742017.6*Math.asin(Math.sqrt(Math.min(1,h)));
  }
  function parts(points,breaks=[]) {
    const bounds=[0,...breaks.filter(i=>Number.isInteger(i)&&i>0&&i<points.length).sort((a,b)=>a-b),points.length];
    return bounds.slice(0,-1).map((a,i)=>points.slice(a,bounds[i+1])).filter(p=>p.length);
  }
  function clipBreaks(breaks,a,b,reverse=false) {
    return breaks.filter(i=>i>a&&i<=b).map(i=>reverse?b-i+1:i-a).sort((x,y)=>x-y);
  }
  function compute(points,heights=[],breaks=[],options={}) {
    const n=points.length,edges=new Set(breaks),pd=Array(n).fill(0),pu=Array(n).fill(0),down=Array(n).fill(0);
    for(let i=1;i<n;i++) pd[i]=pd[i-1]+(edges.has(i)?0:distance(points[i-1],points[i]));
    const raw=Array.from({length:n},(_,i)=>Number.isFinite(heights[i])?heights[i]:null);
    const series=raw.slice(),half=Math.floor(Math.max(1,Math.min(25,options.window||5))/2);
    // Never smooth across missing measurements or original segment boundaries.
    let start=0;
    while(start<n) {
      if(raw[start]===null){start++;continue;}
      let end=start+1;while(end<n&&raw[end]!==null&&!edges.has(end))end++;
      if(options.mode!=='raw') for(let i=start;i<end;i++) {
        let sum=0,count=0;for(let j=Math.max(start,i-half);j<Math.min(end,i+half+1);j++){sum+=raw[j];count++;}
        series[i]=sum/count;
      }
      start=end;
    }
    const threshold=options.mode==='smooth_threshold'?Math.max(0,options.threshold||0):0;
    let anchor=null;
    for(let i=0;i<n;i++) {
      if(i){pu[i]=pu[i-1];down[i]=down[i-1];}
      if(series[i]===null){anchor=null;continue;}
      if(anchor===null||edges.has(i)){anchor=series[i];continue;}
      const delta=series[i]-anchor;
      // A cumulative anchor retains a gradual climb instead of discarding each small step.
      if(Math.abs(delta)>=threshold){if(delta>0)pu[i]+=delta;else down[i]-=delta;anchor=series[i];}
    }
    return {prefDist:pd,prefUp:pu,prefDown:down,elevFilled:null,series,known:raw.filter(v=>v!==null).length};
  }
  function stitch(clips) {
    const route=[],ele=[],breaks=[],annotations=[],gaps=[];
    clips.forEach((c,ci)=>{
      const pts=c.reverse?[...c.points].reverse():c.points;
      const heights=c.reverse?[...c.ele].reverse():c.ele;
      if(!pts.length)return;
      const gap=route.length?distance(route.at(-1),pts[0]):0;
      const duplicate=route.length&&route.at(-1)[0]===pts[0][0]&&route.at(-1)[1]===pts[0][1];
      const skip=duplicate?1:0,offset=route.length-skip;
      if(route.length&&!duplicate){breaks.push(route.length);gaps.push({index:route.length,meters:gap,from:route.at(-1),to:pts[0],clip:ci});}
      (c.breaks||[]).forEach(i=>{const j=c.reverse?pts.length-i:i;if(j>=skip)breaks.push(offset+j);});
      route.push(...pts.slice(skip));ele.push(...heights.slice(skip));
      (c.annotations||[]).forEach(a=>{
        if(!Number.isInteger(a.idx)||a.idx<c.a||a.idx>c.b)return;
        const local=c.reverse?c.b-a.idx:a.idx-c.a;
        annotations.push({...a,idx:offset+local});
      });
    });
    return {route,ele,breaks:[...new Set(breaks)].sort((a,b)=>a-b),annotations,gaps};
  }
  function validateProject(p) {
    if(!p||!Array.isArray(p.route)||p.route.length===1||!p.route.every(validPoint))throw Error('工程轨迹坐标无效 / Invalid project coordinates');
    if(p.version!=null&&(!Number.isInteger(p.version)||p.version<1||p.version>3))throw Error('不支持的工程版本 / Unsupported project version');
    const validateRoute=(t,allowEmpty=false)=>{
      if(!Array.isArray(t.route)||(t.route.length<2&&!(allowEmpty&&t.route.length===0))||!t.route.every(validPoint))throw Error('轨迹坐标无效 / Invalid track');
      if(t.ele!=null&&(!Array.isArray(t.ele)||t.ele.length!==t.route.length||t.ele.some(v=>v!==null&&!Number.isFinite(v))))throw Error('海拔数据无效 / Invalid elevation');
      if(t.breaks!=null&&(!Array.isArray(t.breaks)||t.breaks.some(i=>!Number.isInteger(i)||i<1||i>=t.route.length)))throw Error('断段数据无效 / Invalid segments');
      for(const k of ['annotations','breakpoints','segmentPlans','placemarks','suppressedPlacemarkKeys'])if(t[k]!=null&&!Array.isArray(t[k]))throw Error('工程列表无效 / Invalid project list');
      if(t.breakpoints?.some(i=>!Number.isInteger(i)||i<1||i>=t.route.length-1))throw Error('断点无效 / Invalid breakpoint');
      if(t.placemarks?.some(a=>!a||!validPoint([a.lat,a.lng])))throw Error('导入关键点无效 / Invalid imported waypoint');
      if(t.color!=null&&!/^#[0-9a-f]{6}$/i.test(t.color))throw Error('路线颜色无效 / Invalid route color');
      if(t.annotations?.some(a=>!a||!validPoint(a.latlng)||!(a.idx==null||(Number.isInteger(a.idx)&&a.idx>=0&&a.idx<t.route.length))))throw Error('标注无效 / Invalid annotation');
      if(t.segmentPlans?.some(a=>!a||typeof a!=='object'||Object.values(a).some(v=>typeof v==='object')))throw Error('行程无效 / Invalid plan');
    };
    validateRoute(p,true);
    if(p.tracks!=null&&!Array.isArray(p.tracks))throw Error('轨迹列表无效 / Invalid tracks');
    if(p.clips!=null&&(!Array.isArray(p.clips)||p.clips.some(c=>!c||!Array.isArray(c.points)||c.points.length<2||!c.points.every(validPoint)||!Array.isArray(c.ele)||c.ele.length!==c.points.length)))throw Error('拼接片段无效 / Invalid clips');
    const ids=new Set();(p.tracks||[]).forEach(t=>{validateRoute(t);if(t.id&&ids.has(t.id))throw Error('重复轨迹编号 / Duplicate track ID');ids.add(t.id);});
    return p;
  }
  const api={validPoint,distance,parts,clipBreaks,compute,stitch,validateProject};
  root.RouteCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
