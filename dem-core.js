/* Small, dependency-free terrain calculations shared by the worker and tests. */
(function(root) {
  'use strict';
  const R=6378137,rad=Math.PI/180,MAX_PIXELS=1200000;
  function project(lon,lat) {
    lat=Math.max(-85.05112878,Math.min(85.05112878,lat));
    return [R*lon*rad,R*Math.log(Math.tan(Math.PI/4+lat*rad/2))];
  }
  function unproject(x,y) {return [x/R/rad,(2*Math.atan(Math.exp(y/R))-Math.PI/2)/rad];}
  function intersect(a,b) {
    const v=[Math.max(a[0],b[0]),Math.max(a[1],b[1]),Math.min(a[2],b[2]),Math.min(a[3],b[3])];
    return v[0]<v[2]&&v[1]<v[3]?v:null;
  }
  function routeBounds(points,bufferKm=2) {
    if(!points.length)throw Error('No route');
    let west=Infinity,east=-Infinity,south=Infinity,north=-Infinity;
    for(const [lat,lon] of points){west=Math.min(west,lon);east=Math.max(east,lon);south=Math.min(south,lat);north=Math.max(north,lat);}
    const mid=(south+north)/2*rad;
    const dy=bufferKm*1000/R/rad,dx=dy/Math.max(.01,Math.cos(mid));
    return [west-dx,Math.max(-85,south-dy),east+dx,Math.min(85,north+dy)];
  }
  function grid(bounds,step=30) {
    const [left,bottom]=project(bounds[0],bounds[1]),[right,top]=project(bounds[2],bounds[3]);
    if(!(right>left&&top>bottom))throw Error('Invalid terrain extent');
    step=Math.max(step,(right-left)/1400,(top-bottom)/1400,Math.sqrt((right-left)*(top-bottom)/MAX_PIXELS));
    const width=Math.max(2,Math.floor((right-left)/step)),height=Math.max(2,Math.floor((top-bottom)/step));
    return {width,height,left,right,top,bottom,dx:(right-left)/width,dy:(top-bottom)/height,bounds};
  }
  // Index zero is the first sample center, not the outer corner of an area pixel.
  function pixel(lon,lat,meta) {
    const shift=meta.pixelIsArea?.5:0;
    return [(lon-meta.origin[0])/meta.resolution[0]-shift,(lat-meta.origin[1])/meta.resolution[1]-shift];
  }
  function bilinear(data,width,height,x,y,nodata=null) {
    if(x<0||y<0||x>width-1||y>height-1)return NaN;
    const x0=Math.floor(x),y0=Math.floor(y),x1=Math.min(width-1,x0+1),y1=Math.min(height-1,y0+1),fx=x-x0,fy=y-y0;
    const weights=[(1-fx)*(1-fy),fx*(1-fy),fx*fy,(1-fx)*fy];
    const indices=[y0*width+x0,y0*width+x1,y1*width+x1,y1*width+x0];
    let result=0;
    for(let i=0;i<4;i++){
      if(weights[i]<1e-10)continue;
      const v=data[indices[i]];
      if(!Number.isFinite(v)||v===nodata)return NaN;
      result+=v*weights[i];
    }
    return result;
  }
  const stops=[[0,0,224,231],[.12,0,242,158],[.3,96,245,49],[.5,216,246,18],[.65,255,219,0],[.8,255,165,0],[1,201,102,47]];
  function color(value,min,max) {
    const t=Math.max(0,Math.min(1,(value-min)/Math.max(1,max-min)));
    let i=1;while(i<stops.length-1&&t>stops[i][0])i++;
    const a=stops[i-1],b=stops[i],f=(t-a[0])/(b[0]-a[0]);
    return [1,2,3].map(k=>Math.round(a[k]+(b[k]-a[k])*f));
  }
  function paint(heights,g,shade=true) {
    let min=Infinity,max=-Infinity,known=0;
    for(const v of heights)if(Number.isFinite(v)){min=Math.min(min,v);max=Math.max(max,v);known++;}
    const rgba=new Uint8ClampedArray(heights.length*4),cos=Math.cos(unproject(0,(g.top+g.bottom)/2)[1]*rad);
    const sun=[-.5,-.5,Math.SQRT1_2];
    for(let y=0;y<g.height;y++)for(let x=0;x<g.width;x++) {
      const i=y*g.width+x,v=heights[i];if(!Number.isFinite(v))continue;
      let intensity=1;
      if(shade&&x>0&&y>0&&x<g.width-1&&y<g.height-1) {
        const neighbors=[heights[i-1],heights[i+1],heights[i-g.width],heights[i+g.width]];
        if(neighbors.every(Number.isFinite)) {
          const nx=-(neighbors[1]-neighbors[0])/(2*g.dx*cos),ny=-(neighbors[3]-neighbors[2])/(2*g.dy*cos);
          const light=(nx*sun[0]+ny*sun[1]+sun[2])/Math.hypot(nx,ny,1);
          intensity=.7+.3*Math.max(0,light)/Math.SQRT1_2;
        }
      }
      const rgb=color(v,min,max);for(let k=0;k<3;k++)rgba[4*i+k]=Math.min(255,Math.round(rgb[k]*intensity));rgba[4*i+3]=255;
    }
    return {rgba,min,max,known};
  }
  // Marching squares on one continuous projected grid, including across source-file seams.
  // Missing measurements invalidate a cell, so contours never bridge a coverage hole.
  function contours(data,width,height,interval,limit=200000) {
    if(!interval)return [];
    let min=Infinity,max=-Infinity;for(const v of data)if(Number.isFinite(v)){min=Math.min(min,v);max=Math.max(max,v);}
    if((max-min)/interval>1000)throw Error('Too many contour levels; increase interval');
    const levels=new Map();let count=0;
    for(let y=0;y<height-1;y++)for(let x=0;x<width-1;x++) {
      const i=y*width+x,v=[data[i],data[i+1],data[i+width+1],data[i+width]];
      if(!v.every(Number.isFinite))continue;
      const lo=Math.min(...v),hi=Math.max(...v);
      for(let z=Math.ceil(lo/interval)*interval;z<hi;z+=interval) {
        const mask=v.reduce((m,a,k)=>m|(a>=z?1<<k:0),0);if(!mask||mask===15)continue;
        const edges=[];
        for(const [a,b,p,q] of [[0,1,[x+.5,y+.5],[x+1.5,y+.5]],[1,2,[x+1.5,y+.5],[x+1.5,y+1.5]],[3,2,[x+.5,y+1.5],[x+1.5,y+1.5]],[0,3,[x+.5,y+.5],[x+.5,y+1.5]]]) {
          if((v[a]>=z)===(v[b]>=z)){edges.push(null);continue;}
          const t=(z-v[a])/(v[b]-v[a]);edges.push([p[0]+t*(q[0]-p[0]),p[1]+t*(q[1]-p[1])]);
        }
        const active=edges.map((p,k)=>p?k:-1).filter(k=>k>=0);
        let pairs=active.length===2?[[active[0],active[1]]]:[];
        if(active.length===4) {
          const center=v.reduce((a,b)=>a+b,0)/4;
          const aroundBD=mask===5?center>=z:center<z;
          pairs=aroundBD?[[0,1],[2,3]]:[[0,3],[1,2]];
        }
        if(!levels.has(z))levels.set(z,[]);
        for(const [a,b] of pairs){if(++count>limit)throw Error('Contours too dense; increase interval or crop a smaller area');levels.get(z).push([edges[a],edges[b]]);}
      }
    }
    const result=[];
    for(const [elevation,segments] of [...levels].sort((a,b)=>a[0]-b[0])) {
      const key=p=>`${Math.round(p[0]*1e6)},${Math.round(p[1]*1e6)}`,nodes=new Map();
      segments.forEach((s,i)=>s.forEach(p=>{const k=key(p);if(!nodes.has(k))nodes.set(k,[]);nodes.get(k).push(i);}));
      const used=new Uint8Array(segments.length);
      function walk(start,point) {
        const line=[point];let i=start;
        while(i!==undefined&&!used[i]){used[i]=1;const s=segments[i],last=line.at(-1),next=key(s[0])===key(last)?s[1]:s[0];line.push(next);i=nodes.get(key(next)).find(j=>!used[j]);}
        return line;
      }
      for(const [k,indices] of nodes)if(indices.length===1&&!used[indices[0]]) {
        const s=segments[indices[0]],p=key(s[0])===k?s[0]:s[1];result.push({elevation,major:Math.round(elevation/interval)%5===0,points:walk(indices[0],p)});
      }
      segments.forEach((s,i)=>{if(!used[i])result.push({elevation,major:Math.round(elevation/interval)%5===0,points:walk(i,s[0])});});
    }
    return result;
  }
  const api={project,unproject,intersect,routeBounds,grid,pixel,bilinear,color,paint,contours,MAX_PIXELS};
  root.DemCore=api;if(typeof module!=='undefined')module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
