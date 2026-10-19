const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.env.TRACE_TEST_ROOT||path.join(__dirname,'..'));
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
(async()=>{
 let browser;
 try{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],dialogs=[];
  page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{dialogs.push(d.type());await d.accept();});
  await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1')?r.continue():r.abort());
  const url=`http://127.0.0.1:${server.address().port}/Trace_planner.html`;
  await page.goto(url);await page.waitForFunction(()=>Sidebar.ready);
  const uniqueControls=async()=>{
   const duplicates=await page.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.filter((id,i)=>ids.indexOf(id)!==i);});assert.deepEqual(duplicates,[]);
   for(const id of ['trackList','analysisTrackSelect','trackInput','saveProjectBtn','loadProjectBtn','exportGpxBtn','exportKmlBtn','exportGeoBtn','exportElevationBtn'])assert.equal(await page.locator('#'+id).count(),1);
   assert.equal(await page.locator('#projectBox').count(),0);
  };
  await uniqueControls();assert.equal(await page.locator('#stitchWorkspace').isVisible(),true);assert.equal(await page.locator('#analysisWorkspace').isVisible(),false);
  assert.equal(await page.locator('#onlineSearchBox').isVisible(),true);assert.equal(await page.locator('#clipBox').isVisible(),true);
  const commonVisible=async()=>{for(const id of ['importTracksBox','overviewBox','exportBox'])assert.equal(await page.locator(`#${id} > summary`).isVisible(),true);};await commonVisible();
  assert.equal(await page.locator('#panel .box:not(details)').count(),0);
  // Each visible module can be closed and reopened independently using its native disclosure.
  for(const id of ['importTracksBox','overviewBox','onlineSearchBox','clipBox','basketBox','exportBox']){
    const wasOpen=await page.locator('#'+id).evaluate(e=>e.open);await page.locator(`#${id} > summary`).click();assert.equal(await page.locator('#'+id).evaluate(e=>e.open),!wasOpen);
    await page.locator(`#${id} > summary`).click();assert.equal(await page.locator('#'+id).evaluate(e=>e.open),wasOpen);
  }
  await page.click('#tabAnalysis');await commonVisible();assert.equal(await page.locator('#stitchWorkspace').isVisible(),false);assert.equal(await page.locator('#analysisWorkspace').isVisible(),true);
  for(const id of ['profileBox','elevationBox','breakpointsBox','annotationsBox','leaderPlanner','demPanel'])assert.equal(await page.locator(`#${id} > summary`).isVisible(),true);
  await page.locator('#annotationsBox > summary').click();assert.equal(await page.locator('#annotationsBox').evaluate(e=>e.open),false);
  await page.click('#tabStitch');await page.click('#tabAnalysis');assert.equal(await page.locator('#annotationsBox').evaluate(e=>e.open),false);
  await page.reload();await page.waitForFunction(()=>Sidebar.ready);await page.click('#tabAnalysis');assert.equal(await page.locator('#annotationsBox').evaluate(e=>e.open),false);
  await page.click('#collapseModulesBtn');for(const el of await page.locator('#analysisWorkspace > details').all())assert.equal(await el.evaluate(e=>e.open),false);
  await page.click('#expandModulesBtn');for(const el of await page.locator('#analysisWorkspace > details').all())assert.equal(await el.evaluate(e=>e.open),true);
  await page.click('#tabStitch');await page.click('#expandModulesBtn');
  const gpx=(shift=0)=>`<gpx xmlns="http://www.topografix.com/GPX/1/1"><trk><trkseg><trkpt lat="30" lon="${120+shift}"><ele>100</ele></trkpt><trkpt lat="30.001" lon="${120.001+shift}"><ele>110</ele></trkpt><trkpt lat="30.002" lon="${120.002+shift}"><ele>120</ele></trkpt></trkseg></trk></gpx>`;
  await page.setInputFiles('#trackInput',[{name:'first.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from(gpx())},{name:'second.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from(gpx(.1))}]);
  await page.waitForFunction(()=>tracks.length===2);const originals=await page.evaluate(()=>tracks.map(t=>t.id));
  await page.click('#addClipBtn');await page.click('#buildBtn');await page.waitForFunction(()=>tracks.length===3);
  assert.equal(dialogs.includes('prompt'),false);
  const built=await page.evaluate(()=>({id:activeTrackId,name:activeSource,origin:tracks.find(t=>t.id===activeTrackId).origin,route:route.map(p=>p.slice())}));
  assert.equal(built.name,'拼接轨迹 1');assert.equal(built.origin,'stitched');assert.equal(await page.textContent('#trackCount'),'3');
  assert.equal(await page.locator('#trackList .track-active').getAttribute('data-track-id'),built.id);
  await page.click('#buildBtn');assert.equal(await page.evaluate(()=>activeSource),'拼接轨迹 2');assert.equal(await page.evaluate(()=>tracks.length),4);
  const secondBuilt=await page.evaluate(()=>activeTrackId);
  for(const mode of ['Stitch','Analysis','Stitch','Analysis']){
    await page.click('#tab'+mode);await commonVisible();await page.selectOption('#analysisTrackSelect',originals[0]);
    assert.equal(await page.evaluate(()=>activeSource),'first.gpx');
    await page.selectOption('#analysisTrackSelect',built.id);assert.deepEqual(await page.evaluate(()=>route),built.route);
    // Export/project is the same open module regardless of tab, so one set of live handlers suffices.
    assert.equal(await page.locator('#saveProjectBtn').isVisible(),true);assert.equal(await page.locator('#exportGpxBtn').isVisible(),true);
  }
  await page.waitForFunction(id=>JSON.parse(localStorage.getItem('trace_planner_draft_v3')||'null')?.tracks.some(t=>t.id===id),secondBuilt);
  const project=await page.evaluate(()=>serializeProject());await page.evaluate(p=>restoreProject(p),project);
  assert.equal(await page.evaluate(id=>tracks.find(t=>t.id===id).origin,built.id),'stitched');
  await page.selectOption('#analysisTrackSelect',secondBuilt);assert.equal(await page.evaluate(()=>activeSource),'拼接轨迹 2');await uniqueControls();
  await page.click('#langToggle');assert.equal(await page.textContent('#workspaceTitle'),'Track analysis');
  assert.equal(await page.textContent('#exportBox > summary .panel-title'),'Export & project');
  assert.equal(await page.textContent('#profileBox > summary .panel-title'),'Elevation profile');
  await page.click('#tabStitch');assert.equal(await page.textContent('#workspaceTitle'),'Track stitching');
  assert.equal(await page.textContent('#importTracksBox > summary .panel-title'),'Tracks (imported / stitched)');
  await page.locator('#tabStitch').press('ArrowRight');assert.equal(await page.locator('#tabAnalysis').getAttribute('aria-selected'),'true');
  await page.click('#langToggle');await page.click('#collapseModulesBtn');
  await page.locator('#importTracksBox > summary').click();
  await page.locator('#panel').evaluate(e=>e.scrollTop=0);
  await page.screenshot({path:'/tmp/trace-sidebar-analysis-desktop.png',fullPage:true});
  await page.click('#tabStitch');await page.locator('#panel').evaluate(e=>e.scrollTop=0);await page.screenshot({path:'/tmp/trace-sidebar-stitch-desktop.png',fullPage:true,animations:'disabled'});
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>map.getSize().x===390);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'/tmp/trace-sidebar-mobile.png',fullPage:true});assert.deepEqual(errors,[]);
  console.log('Sidebar integration passed: unique shared controls, separate workspaces, every module collapsible, persisted folds, automatic named routes, switching and project roundtrip, bilingual headings, keyboard tabs, mobile.');
 }finally{if(browser)await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
