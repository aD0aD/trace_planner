const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.env.TRACE_TEST_ROOT||path.join(__dirname,'..'));
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1')?r.continue():r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1kAAAAASUVORK5CYII=','base64')}));
  await page.goto(`http://127.0.0.1:${server.address().port}/Trace_planner.html`);
  console.log('Page ready');
  const fixture=process.env.TRACE_MEMORY_PROJECT;
  if(fixture)await page.locator('#loadProjectInput').setInputFiles(fixture);
  else await page.evaluate(()=>{const t=pushImportedTrack({name:'photos',route:[[30,120],[30,120.01]],ele:[1,2],placemarks:[]});applyTrackAsActive(t);annos.push({idx:0,text:'original',latlng:[30,120],imageData:'data:image/jpeg;base64,'+'A'.repeat(5*1024*1024)});observeChanges();});
  console.log('File supplied');await page.waitForFunction(()=>annos.length>0);console.log('Project loaded');
  const baseline=await page.evaluate(()=>snapshot());
  const cdp=await page.context().newCDPSession(page),heap=[];
  for(let i=0;i<31;i++){
   if(i)await page.evaluate(i=>{annos[0].notes='Memory regression '+i;observeChanges();},i);
   if(i%10===0){heap.push((await cdp.send('Runtime.getHeapUsage')).usedSize);console.log('Edit',i,'heap',heap.at(-1));}
  }
  const stats=await page.evaluate(()=>({history:history.length,snapshotBytes:lastSnapshot.length,images:projectMemory.images.size,retainedBytes:projectMemory.retainedBytes([lastSnapshot,...history,...redoHistory])}));
  assert.equal(stats.history,20);assert.ok(stats.snapshotBytes<2*1024*1024);assert.ok(heap.at(-1)-heap[0]<64*1024*1024,JSON.stringify(heap));
  await page.evaluate(()=>{annos.splice(0,1);observeChanges();historyMove(true);});
  assert.equal(await page.evaluate(()=>annos[0].notes),'Memory regression 30');
  await page.evaluate(()=>historyMove(false));await page.evaluate(()=>historyMove(true));
  await page.evaluate(s=>{restoreProject(JSON.parse(s));observeChanges();},baseline);
  assert.equal(await page.evaluate(()=>snapshot()),baseline);
  console.log('Undo and redo verified');await page.locator('#exportBox > summary').click();const downloadPromise=page.waitForEvent('download');await page.click('#saveProjectBtn');const download=await downloadPromise;
  const saved=await download.path();if(process.env.TRACE_MEMORY_OUTPUT)await download.saveAs(process.env.TRACE_MEMORY_OUTPUT);
  await page.locator('#loadProjectInput').setInputFiles(saved);
  await page.waitForFunction(()=>history.length===0);
  assert.equal(await page.evaluate(()=>snapshot()),baseline);assert.deepEqual(errors,[]);
  console.log(JSON.stringify({stats,heapBytes:heap,exportBytes:fs.statSync(saved).size,roundtrip:'all serialized project fields and photos preserved'}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
