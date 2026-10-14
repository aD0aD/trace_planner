/* Only this worker owns TIFF handles and decoded raster windows. */
importScripts('vendor/geotiff.js','dem-core.js');
let sources=[],generation=0,controller=null;
const C=DemCore;
const MAX_DECODE_BYTES=32*1024*1024;
// One projected crop only. Neither TIFF blocks nor previous crops accumulate here.
const MAX_CACHE_BYTES=8*1024*1024;
let cropCache=null,sourceVersion=0,rasterReads=0;
function invalidateCache() {cropCache=null;sourceVersion++;rasterReads=0;}
function metadata(image,reference=null) {
  const keys={...(reference?.getGeoKeys()||{}),...(image.getGeoKeys()||{})};
  if(keys.ProjectedCSTypeGeoKey||keys.GeographicTypeGeoKey!==4326)throw Error('仅支持 WGS84 经纬度 GeoTIFF (EPSG:4326) / WGS84 GeoTIFF required');
  if(keys.VerticalUnitsGeoKey&&keys.VerticalUnitsGeoKey!==9001)throw Error('高程单位必须是米 / Elevation units must be metres');
  if(image.getSamplesPerPixel()!==1)throw Error('请选择单波段高程 TIFF / Select a single-band elevation TIFF');
  const fd=image.getFileDirectory();
  if(fd.getValue('ModelTransformation'))throw Error('暂不支持旋转栅格，请转为北向上的 WGS84 GeoTIFF / Rotated rasters are unsupported');
  let origin;try{origin=image.getOrigin();}catch(e){if(!reference)throw e;origin=reference.getOrigin();}
  const tie=fd.getValue('ModelTiepoint');
  const resolution=image.getResolution(reference);
  if(tie&&tie.length===6){origin[0]-=tie[0]*resolution[0];origin[1]-=tie[1]*resolution[1];}
  if(!(resolution[0]>0&&resolution[1]<0))throw Error('需要北向上的栅格 / North-up raster required');
  const width=image.getWidth(),height=image.getHeight();
  if(width<2||height<2)throw Error('DEM 至少需要 2×2 像元 / DEM requires at least 2×2 samples');
  const bytes=Math.ceil(image.getBitsPerSample()/8),blockWidth=image.getTileWidth(),blockHeight=image.getTileHeight();
  const bounds=[origin[0],origin[1]+height*resolution[1],origin[0]+width*resolution[0],origin[1]];
  if(!bounds.every(Number.isFinite)||bounds[0]<-180.1||bounds[2]>180.1||bounds[1]<-90.1||bounds[3]>90.1)throw Error('DEM 经纬度范围无效 / Invalid DEM extent');
  return {width,height,origin,resolution,bounds,bytes,blockWidth,blockHeight,pixelIsArea:(keys.GTRasterTypeGeoKey||1)===1,nodata:image.getGDALNoData()};
}
function checkBlock(meta) {
  if(meta.blockWidth*meta.blockHeight*meta.bytes>MAX_DECODE_BYTES)throw Error('TIFF 单个解压块超过 32 MB，请转为分块且带概览的 GeoTIFF / TIFF block exceeds 32 MB; convert to tiled GeoTIFF with overviews');
}
async function openFiles(files,token) {
  const incoming=[],errors=[];
  for(const file of files) {
    let tiff;
    try {
      if(/_num\.tiff?$/i.test(file.name))throw Error('_num 是观测次数，请选择 _dem.tif / _num contains observation counts; select _dem.tif');
      tiff=await GeoTIFF.fromBlob(file,controller.signal);
      const base=await tiff.getImage(),meta=metadata(base),levels=[{image:base,meta}];
      const n=await tiff.getImageCount();
      if(n>32)throw Error('TIFF 层级过多 / Too many TIFF image levels');
      for(let i=1;i<n;i++){try{const image=await tiff.getImage(i),m=metadata(image,base);if(m.width<meta.width&&m.height<meta.height)levels.push({image,meta:m});}catch{/* Unsupported secondary images are not DEM overviews. */}}
      levels.sort((a,b)=>a.meta.resolution[0]-b.meta.resolution[0]);
      if(!levels.some(l=>l.meta.blockWidth*l.meta.blockHeight*l.meta.bytes<=MAX_DECODE_BYTES))checkBlock(meta);
      // ASTER GDEM uses -9999 for voids even when older files omit GDAL_NODATA.
      const nodata=meta.nodata??(/^ASTGTM/i.test(file.name)?-9999:null);
      incoming.push({file,tiff,meta,levels,nodata});
    }catch(e){if(tiff)await tiff.close();errors.push(`${file.name}: ${e.message}`);}
    if(token!==generation){for(const s of incoming)await s.tiff.close();return;}
  }
  if(incoming.length){invalidateCache();for(const s of sources)await s.tiff.close();sources=incoming;}
  postMessage({type:'opened',token,replaced:incoming.length>0,sources:sources.map(s=>({name:s.file.name,size:s.file.size,...s.meta,overviews:s.levels.length-1})),errors});
}
async function readSource(source,g,heights,token,stats) {
  const overlap=C.intersect(g.bounds,source.meta.bounds);if(!overlap)return;
  const middleLat=(g.bounds[1]+g.bounds[3])/2*Math.PI/180;
  let level=source.levels[0];
  for(const candidate of source.levels) {
    const meters=candidate.meta.resolution[0]*Math.PI/180*6378137;
    if(meters<=g.dx*1.2)level=candidate;
  }
  const {image,meta:m}=level;checkBlock(m);
  const xy0=C.pixel(overlap[0],overlap[3],m),xy1=C.pixel(overlap[2],overlap[1],m);
  const x0=Math.max(0,Math.floor(xy0[0])),x1=Math.min(m.width,Math.ceil(xy1[0])+2);
  const y0=Math.max(0,Math.floor(xy0[1])),y1=Math.min(m.height,Math.ceil(xy1[1])+2);
  if(x1<=x0||y1<=y0)return;
  const xs=Array.from({length:g.width},(_,x)=>C.pixel(C.unproject(g.left+(x+.5)*g.dx,0)[0],0,m)[0]);
  const ys=Array.from({length:g.height},(_,y)=>C.pixel(0,C.unproject(0,g.top-(y+.5)*g.dy)[1],m)[1]);
  const blockColumns=Math.ceil(x1/m.blockWidth)-Math.floor(x0/m.blockWidth);
  const bytesPerBlockRow=blockColumns*m.blockWidth*m.blockHeight*m.bytes;
  if(bytesPerBlockRow>MAX_DECODE_BYTES)throw Error('裁剪区域横跨过多 TIFF 解压块，请缩小范围或添加概览 / Crop crosses too many TIFF blocks; narrow it or add overviews');
  const rows=Math.max(1,Math.min(128,Math.floor(262144/(x1-x0)),Math.floor(MAX_DECODE_BYTES/bytesPerBlockRow)*m.blockHeight-1));
  let sampled=0;
  for(let top=y0;top<y1;top+=rows) {
    if(token!==generation)return;
    const end=Math.min(y1,top+rows),bottom=Math.min(m.height,end+1);
    rasterReads++;
    const data=await image.readRasters({window:[x0,top,x1,bottom],samples:[0],interleave:true,signal:controller.signal});
    stats.sourcePixels+=(x1-x0)*(bottom-top);stats.peakWindowPixels=Math.max(stats.peakWindowPixels,data.length);
    for(let y=0;y<g.height;y++) {
      const sy=ys[y];if(sy<top||sy>=end||sy>m.height-1)continue;
      for(let x=0;x<g.width;x++) {
        const sx=xs[x];if(sx<x0||sx>x1-1)continue;
        const i=y*g.width+x;if(Number.isFinite(heights[i]))continue;
        heights[i]=C.bilinear(data,x1-x0,bottom-top,sx-x0,sy-top,source.nodata);
        if(Number.isFinite(heights[i]))sampled++;
      }
    }
    postMessage({type:'progress',token,name:source.file.name,percent:Math.round((end-y0)/(y1-y0)*100)});
  }
  stats.used.push({name:source.file.name,window:[x0,y0,x1,y1],sampled,overview:level!==source.levels[0]});
  stats.groundStep=g.dx*Math.cos(middleLat);
}
async function render(options,token) {
  if(!sources.length)throw Error('请先导入 DEM / Import DEM first');
  const touching=sources.filter(s=>C.intersect(options.bounds,s.meta.bounds));
  if(!touching.length)throw Error('裁剪范围内没有 DEM 覆盖 / No DEM covers this crop');
  const native=Math.min(...touching.map(s=>s.meta.resolution[0]*Math.PI/180*6378137));
  const g=C.grid(options.bounds,native),key=JSON.stringify([sourceVersion,g.bounds,g.width,g.height]);
  const stats={sourcePixels:0,peakWindowPixels:0,used:[],cacheHit:cropCache?.key===key};
  let heights;
  if(stats.cacheHit) {
    heights=cropCache.heights;
    stats.used=cropCache.used;stats.groundStep=cropCache.groundStep;
  }else {
    // Drop the old crop before allocating the replacement, including when a request is cancelled.
    cropCache=null;heights=new Float32Array(g.width*g.height);heights.fill(NaN);
    for(const s of touching){await readSource(s,g,heights,token,stats);if(token!==generation)return;}
  }
  const painted=C.paint(heights,g,options.shade);
  if(!painted.known)throw Error('裁剪范围内没有有效高程 / No valid elevations in crop');
  if(!stats.cacheHit&&heights.byteLength<=MAX_CACHE_BYTES)cropCache={key,heights,used:stats.used,groundStep:stats.groundStep};
  stats.cacheBytes=cropCache?.heights.byteLength||0;stats.rasterReads=rasterReads;
  const lines=C.contours(heights,g.width,g.height,options.interval);
  if(token!==generation)return;
  postMessage({type:'rendered',token,grid:g,rgba:painted.rgba,min:painted.min,max:painted.max,known:painted.known,lines,stats,interval:options.interval,shade:options.shade},[painted.rgba.buffer]);
}
let queue=Promise.resolve();
onmessage=event=>{
  const {type,token,...data}=event.data;
  generation=token;if(controller)controller.abort();controller=new AbortController();
  if(type==='cancel')return;
  queue=queue.catch(()=>{}).then(async()=>{
    if(token!==generation)return;
    try {
      if(type==='open')await openFiles(data.files,token);
      else if(type==='render')await render(data.options,token);
      else if(type==='clear'){invalidateCache();for(const s of sources)await s.tiff.close();sources=[];postMessage({type:'cleared',token});}
    }catch(e){if(token===generation)postMessage({type:'error',token,message:e.message});}
  });
};
