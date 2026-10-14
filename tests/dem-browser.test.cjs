/* Synthetic fixtures run in CI; optional local ASTER files exercise the same UI without being committed. */
const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.env.TRACE_TEST_ROOT||path.join(__dirname,'..')),real=!!process.env.DEM_TEST_FILES;
const types={'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png'};
const server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.join(root,name==='/'?'index.html':name);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
(async()=>{
 let browser;
 try {
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1')?r.continue():r.abort());
  await page.goto(`http://127.0.0.1:${server.address().port}/Trace_planner.html`);await page.waitForSelector('#demPanel');
  await page.locator('#demPanel summary').click();assert.equal(await page.inputValue('#demInterval'),'20');
  let files;
  if(real) {
    files=process.env.DEM_TEST_FILES.split(';');
    await page.setInputFiles('#trackInput',process.env.DEM_TEST_KML);
    await page.waitForFunction(()=>route.length>100);
  }else {
    await page.addScriptTag({url:`http://127.0.0.1:${server.address().port}/vendor/geotiff.js`});
    const generated=await page.evaluate(()=>[0,1].map(side=>{
      const width=129,height=129,west=side?121:120.9872,values=new Float32Array(width*height);
      for(let y=0;y<height;y++)for(let x=0;x<width;x++)values[y*width+x]=100+(x+side*128)*2+y*3;
      // The void is inside the crop, rather than at the source edge.
      if(!side)for(let y=45;y<55;y++)for(let x=95;x<105;x++)values[y*width+x]=-9999;
      const buffer=GeoTIFF.writeArrayBuffer(values,{width,height,BitsPerSample:[32],SampleFormat:[3],ModelPixelScale:[.0001,.0001,0],ModelTiepoint:[0,0,0,west-.00005,28.38645,0],GeographicTypeGeoKey:4326,GTModelTypeGeoKey:2,GTRasterTypeGeoKey:1,GDAL_NODATA:'-9999\0'});
      return {name:`terrain-${side}.tif`,bytes:Array.from(new Uint8Array(buffer))};
    }));
    files=generated.map(f=>({name:f.name,mimeType:'image/tiff',buffer:Buffer.from(f.bytes)}));
    await page.setInputFiles('#trackInput',{name:'seam.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from('<gpx><trk><trkseg><trkpt lat="28.38" lon="120.997"><ele>400</ele></trkpt><trkpt lat="28.381" lon="121.004"><ele>500</ele></trkpt></trkseg></trk></gpx>')});
    await page.fill('#demBuffer','0.1');await page.locator('#demBuffer').press('Tab');
  }
  const originalElev=await page.evaluate(()=>ele.slice());
  await page.setInputFiles('#demInput',files);
  await page.waitForFunction(()=>!!Terrain.state.result,{},{timeout:90000});
  const info=await page.evaluate(()=>{const {result:r,sources}=Terrain.state;return {files:sources.length,width:r.grid.width,height:r.grid.height,coverage:r.known/(r.grid.width*r.grid.height),interval:r.interval,lines:r.lines.length,min:r.min,max:r.max,stats:r.stats,metadata:sources.map(s=>({name:s.name,width:s.width,height:s.height,resolution:s.resolution,bounds:s.bounds}))};});
  assert.equal(info.files,2);assert.equal(info.interval,20);assert.ok(info.lines>0);assert.ok(info.width*info.height<1200000);assert.equal(info.stats.used.length,2);assert.ok(info.stats.used.every(s=>s.sampled>0));
  assert.ok(info.stats.peakWindowPixels<=262144+info.metadata[0].width);assert.deepEqual(await page.evaluate(()=>ele.slice()),originalElev);
  assert.equal(info.stats.cacheHit,false);assert.ok(info.stats.rasterReads>0);assert.ok(info.stats.cacheBytes<=8*1024*1024);
  if(real){assert.ok(info.coverage>.99);assert.ok(info.stats.sourcePixels<3601*3601/10);}
  else assert.ok(info.coverage<1&&info.coverage>.8);
  // No transparent band at the 121-degree source seam (away from the intentional void).
  const seam=await page.evaluate(()=>{const r=Terrain.state.result,g=r.grid,x=Math.floor((DemCore.project(121,0)[0]-g.left)/g.dx);let blank=0;for(let y=2;y<g.height-2;y++)if(!r.rgba[(y*g.width+x)*4+3])blank++;return blank;});assert.equal(seam,0);
  const count=info.lines;
  await page.selectOption('#demInterval','50');await page.waitForFunction(()=>Terrain.state.result?.interval===50);
  assert.ok(await page.evaluate(()=>Terrain.state.result.lines.length)<count);
  let cached=await page.evaluate(()=>Terrain.state.result.stats);assert.equal(cached.cacheHit,true);assert.equal(cached.sourcePixels,0);assert.equal(cached.rasterReads,info.stats.rasterReads);
  await page.evaluate(()=>window.shadedPixels=Terrain.state.result.rgba.slice());
  await page.uncheck('#demShade');await page.waitForFunction(()=>Terrain.state.result?.shade===false);
  cached=await page.evaluate(()=>Terrain.state.result.stats);assert.equal(cached.cacheHit,true);assert.equal(cached.rasterReads,info.stats.rasterReads);
  assert.ok(await page.evaluate(()=>Terrain.state.result.rgba.some((v,i)=>v!==window.shadedPixels[i])));
  await page.check('#demShade');await page.waitForFunction(()=>Terrain.state.result?.shade===true);
  assert.ok(await page.evaluate(()=>Terrain.state.result.rgba.every((v,i)=>v===window.shadedPixels[i])));
  await page.selectOption('#demInterval','0');await page.waitForFunction(()=>Terrain.state.result?.interval===0);assert.equal(await page.evaluate(()=>Terrain.state.result.lines.length),0);
  await page.selectOption('#demInterval','20');await page.waitForFunction(()=>Terrain.state.result?.interval===20);
  const project=await page.evaluate(()=>serializeProject());assert.equal(project.terrain.interval,20);assert.equal(project.terrain.sources.length,2);assert.ok(JSON.stringify(project.terrain).length<1500);
  const downloadPromise=page.waitForEvent('download');await page.click('#demExport');const download=await downloadPromise;
  const dir=process.env.DEM_TEST_OUTPUT||'/tmp';fs.mkdirSync(dir,{recursive:true});const png=path.join(dir,real?'yandang-terrain-20m.png':'trace-dem-synthetic.png');await download.saveAs(png);assert.ok(fs.statSync(png).size>1000);
  if(real){fs.writeFileSync(path.join(dir,'yandang-dem.project.json'),JSON.stringify(project,null,2));fs.writeFileSync(path.join(dir,'dem-test-report.json'),JSON.stringify(info,null,2));}
  await page.evaluate(()=>{const b=Terrain.state.result.grid.bounds;map.fitBounds([[b[1],b[0]],[b[3],b[2]]],{animate:false,padding:[15,15]});});
  await page.locator('#panel').evaluate(el=>el.scrollTop=document.getElementById('demPanel').offsetTop-20);await page.screenshot({path:path.join(dir,real?'yandang-dem-desktop.png':'trace-dem-desktop.png'),fullPage:true});
  // The rendering settings are part of project restore and undo, while TIFF contents are not.
  await page.evaluate(p=>restoreProject(p),project);await page.waitForFunction(()=>Terrain.state.result?.interval===20);
  // A rejected ASTER observation-count file cannot destroy the current valid terrain.
  await page.setInputFiles('#demInput',{name:'ASTGTM2_N28E121_num.tif',mimeType:'image/tiff',buffer:Buffer.from([0])});
  await page.waitForFunction(()=>document.getElementById('demStatus').textContent.includes('_num'));
  assert.ok(await page.evaluate(()=>!!Terrain.state.result));assert.equal(await page.evaluate(()=>Terrain.state.sources.length),2);
  // Two map clicks set a custom crop without entering the annotation/pick modes.
  await page.click('#demSelect');
  await page.evaluate(()=>{const b=Terrain.state.result.grid.bounds,dx=(b[2]-b[0])*.2,dy=(b[3]-b[1])*.2;map.fire('click',{latlng:L.latLng(b[1]+dy,b[0]+dx)});map.fire('click',{latlng:L.latLng(b[3]-dy,b[2]-dx)});});
  await page.waitForFunction(()=>Terrain.state.result&&JSON.stringify(Terrain.state.result.grid.bounds)===JSON.stringify(Terrain.state.options.customBounds));
  assert.equal(await page.evaluate(()=>Terrain.state.selecting),false);
  cached=await page.evaluate(()=>Terrain.state.result.stats);assert.equal(cached.cacheHit,false);assert.ok(cached.rasterReads>info.stats.rasterReads);
  await page.evaluate(p=>restoreProject(p),project);await page.waitForFunction(()=>Terrain.state.result?.interval===20);
  assert.equal(await page.evaluate(()=>Terrain.state.result.stats.cacheHit),false);
  // Reopening even the same filenames and sizes creates new source handles and invalidates the crop.
  const oldToken=await page.evaluate(()=>Terrain.state.result.token);
  await page.setInputFiles('#demInput',files);await page.waitForFunction(t=>Terrain.state.result?.token>t,oldToken,{timeout:90000});
  cached=await page.evaluate(()=>Terrain.state.result.stats);assert.equal(cached.cacheHit,false);assert.ok(cached.sourcePixels>0);
  await page.click('#langToggle');assert.equal(await page.textContent('#demExport'),'Export terrain PNG');
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:path.join(dir,real?'yandang-dem-mobile.png':'trace-dem-mobile.png'),fullPage:true});
  // Cancelling an in-flight request must prevent it from replacing the current terrain.
  await page.evaluate(()=>{Terrain.render(true);document.getElementById('demCancel').click();});await page.waitForTimeout(300);assert.equal(await page.evaluate(()=>Terrain.state.busy),false);
  // Out-of-coverage crops fail explicitly instead of inventing terrain.
  await page.selectOption('#demCropMode','view');await page.evaluate(()=>map.setView([0,0],12));await page.waitForFunction(()=>document.getElementById('demStatus').textContent.includes('No DEM covers'));
  // Cached worker/library assets must support a new local import on an offline revisit.
  await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  await page.context().setOffline(true);await page.reload();await page.waitForSelector('#demPanel');
  await page.evaluate(p=>restoreProject(p),project);assert.equal(await page.evaluate(()=>Terrain.state.sources.length),0);
  await page.setInputFiles('#demInput',files);await page.waitForFunction(()=>Terrain.state.result?.interval===20,{},{timeout:90000});
  assert.equal(await page.evaluate(()=>Terrain.state.result.stats.used.length),2);assert.equal(await page.evaluate(()=>Terrain.state.result.stats.cacheHit),false);await page.context().setOffline(false);
  assert.deepEqual(errors,[]);
  console.log(`${real?'ASTER + Yandang':'Synthetic'} DEM integration passed: ${JSON.stringify(info)}`);
  console.log(`Terrain PNG: ${png}`);
 }finally{if(browser)await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
