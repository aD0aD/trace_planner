const {chromium}=require(process.env.PLAYWRIGHT_PATH||'playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(process.env.TRACE_TEST_ROOT||path.join(__dirname,'..'));
const types={'.js':'application/javascript','.html':'text/html','.css':'text/css','.png':'image/png'};
const server=http.createServer((req,res)=>{const name=decodeURIComponent(new URL(req.url,'http://localhost').pathname),file=path.join(root,name==='/'?'index.html':name);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',types[path.extname(file)]||'text/plain');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH||(fs.existsSync('/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge')?'/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge':undefined)});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
 page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='prompt'?d.accept('Test stitched route'):d.accept());
 await page.route('**/*',r=>r.request().url().startsWith('http://127.0.0.1')?r.continue():r.abort());
 await page.goto(`http://127.0.0.1:${server.address().port}/Trace_planner.html`);await page.waitForSelector('#leaderPlanner');
 // The visible ruler must match geodesic distance at the centre latitude, on any basemap.
 const checkScale=async()=>{
   assert.equal(await page.locator('.map-scale').count(),1);
   assert.equal(await page.locator('.map-scale').isVisible(),true);
   const measured=await page.evaluate(()=>{
     const ruler=document.querySelector('.map-scale-bar').getBoundingClientRect(),box=document.querySelector('.map-scale').getBoundingClientRect(),bounds=document.querySelector('#map').getBoundingClientRect(),size=map.getSize();
     const label=document.querySelector('.map-scale-labels span:last-child').textContent;
     const metres=parseFloat(label)*(label.endsWith('km')?1000:1);
     const actual=map.distance(map.containerPointToLatLng([size.x/2-ruler.width/2,size.y/2]),map.containerPointToLatLng([size.x/2+ruler.width/2,size.y/2]));
     const labels=[...document.querySelectorAll('.map-scale-labels span')].filter(el=>getComputedStyle(el).visibility!=='hidden').map(el=>el.getBoundingClientRect());
     return {label,metres,width:ruler.width,labelWidths:labels.map(r=>r.width),error:Math.abs(actual-metres)/metres,inside:box.left>=bounds.left&&box.right<=bounds.right&&box.top>=bounds.top&&box.bottom<=bounds.bottom,
       readable:labels.every((r,i)=>!i||r.left>=labels[i-1].right+2)};
   });
   assert.ok(measured.error<.005,`Incorrect map scale: ${JSON.stringify(measured)}`);
   assert.ok(measured.inside,'Scale must stay inside the map');
   assert.ok(measured.readable,`Scale labels must not overlap: ${JSON.stringify(measured)}`);
   return measured;
 };
 const initialScale=await checkScale();assert.match(initialScale.label,/km$/);
 await page.evaluate(()=>map.setView([0,120],12,{animate:false}));const equatorScale=await checkScale();
 await page.evaluate(()=>map.setView([60,120],12,{animate:false}));const northScale=await checkScale();
 assert.ok(northScale.metres<equatorScale.metres,'Panning north must account for Mercator scale distortion');
 await page.evaluate(()=>map.setZoom(19,{animate:false}));assert.match((await checkScale()).label,/\d m$/);
 await page.evaluate(()=>map.setView([80,120],0,{animate:false}));await checkScale();
 await page.evaluate(()=>map.setView([31.2,121.4],8,{animate:false}));
 const compatibility=await page.evaluate(async()=>{
   const prefixed=parseGpxText('<g:gpx xmlns:g="http://www.topografix.com/GPX/1/1"><g:rte><g:rtept lat="30" lon="120"/><g:rtept lat="30" lon="120.01"/><g:rtept/></g:rte></g:gpx>','route.gpx');
   const zip=new JSZip();zip.file('route.kml','<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><LineString><coordinates>120,30,100 120.01,30,110</coordinates></LineString></Placemark></Document></kml>');
   zip.file('notes.kml','<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><name>Water photo</name><description>&lt;img src="photo.png"/&gt;</description><Point><coordinates>120,30</coordinates></Point></Placemark></Document></kml>');
   zip.file('photo.png','iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jX1kAAAAASUVORK5CYII=',{base64:true});
   const kmz=await parseFile(new File([await zip.generateAsync({type:'uint8array'})],'multi.kmz'));
   return {route:prefixed.route.length,missing:prefixed.ele,kmz:kmz.route.length,image:kmz.placemarks[0].imageData?.startsWith('data:image/jpeg')};
 });assert.deepEqual(compatibility,{route:2,missing:[null,null],kmz:2,image:true});
 const gpx='<gpx xmlns="http://www.topografix.com/GPX/1/1"><wpt lat="30" lon="120"><name>Water</name><desc>Seasonal; check before departure</desc></wpt><trk><trkseg><trkpt lat="30" lon="120"><ele>100</ele></trkpt><trkpt lat="30" lon="120.01"><ele>110</ele></trkpt></trkseg><trkseg><trkpt lat="31" lon="121"><ele>1000</ele></trkpt><trkpt lat="31" lon="121.01"><ele>1010</ele></trkpt></trkseg></trk></gpx>';
 await page.setInputFiles('#trackInput',{name:'multisegment.gpx',mimeType:'application/gpx+xml',buffer:Buffer.from(gpx)});
 await page.waitForFunction(()=>route.length===4);
 let state=await page.evaluate(()=>({breaks:routeBreaks,up:prefUp.at(-1),dist:prefDist.at(-1),notes:annos[0].notes}));assert.deepEqual(state.breaks,[2]);assert.ok(state.dist<2300);assert.equal(state.notes,'Seasonal; check before departure');
 await page.evaluate(()=>{annos.push({idx:1,text:'Manual risk',type:'risk',color:'#7c3aed',notes:'Check footing',verified:'verified',latlng:route[1].slice()});refreshAnnoMarkers();renderAnnoList();observeChanges();});
 await page.click('#tabAnalysis');await page.selectOption('#elevModeSelect','raw');await page.click('#tabStitch');assert.equal(await page.evaluate(()=>annos.length),2);assert.equal(await page.evaluate(()=>prefUp.at(-1)),20);
 await page.evaluate(()=>{$('startRange').value=3;$('endRange').value=2;updateSegment();});assert.equal(await page.textContent('#segDown'),'10 m');assert.equal(await page.textContent('#segUp'),'0 m');
 await page.click('#addClipBtn');await page.click('#buildBtn');assert.equal(await page.evaluate(()=>tracks.length),2);assert.equal(await page.evaluate(()=>route.length),2);
 await page.click('#tabAnalysis');await page.selectOption('#analysisTrackSelect',await page.evaluate(()=>tracks[0].id));assert.equal(await page.evaluate(()=>annos.length),2);
 await page.click('#tabAnalysis');assert.equal(await page.locator('#totalDist').isVisible(),true);assert.equal(await page.locator('#liveProfileCanvas').isVisible(),true);
 await page.click('#autoSplitBtn');assert.equal(await page.evaluate(()=>breakpoints.length>0),true);
 const project=await page.evaluate(()=>serializeProject());
 await page.evaluate(p=>restoreProject(p),project);assert.equal(await page.evaluate(()=>annos.length),2);assert.deepEqual(await page.evaluate(()=>routeBreaks),[2]);
 const exports=await page.evaluate(()=>({gpx:routeToGpx(route,annos,'route ]]> &'),kml:routeToKml(route,annos,'route ]]> &'),geo:routeToGeoJSON(route,annos,'route')}));
 const parsed=await page.evaluate(({gpx,kml})=>{const gp=parseGpxText(gpx,'export.gpx'),kp=parseKmlText(kml,'export.kml');return {gb:gp.breaks,kb:kp.breaks,gn:gp.annotations[1].notes,kn:kp.annotations[1].notes,ge:gp.ele,ke:kp.ele};},exports);
 assert.deepEqual(parsed.gb,[2]);assert.deepEqual(parsed.kb,[2]);assert.equal(parsed.gn,'Check footing');assert.equal(parsed.kn,'Check footing');assert.equal(JSON.parse(exports.geo).features[0].geometry.type,'MultiLineString');
 const before=await page.evaluate(()=>snapshot());await page.evaluate(()=>{try{restoreProject({version:3,route:[[30,120],[30,121]],tracks:[{route:[[999,0],[0,0]]}]});}catch{}});assert.equal(await page.evaluate(()=>snapshot()),before);
 await page.evaluate(()=>{annos.push({idx:0,text:'<img src=x onerror="window.injected=true">',type:'note',color:'#000000',latlng:route[0]});refreshAnnoMarkers();renderAnnoList();});assert.equal(await page.evaluate(()=>!!window.injected),false);
 // Leader edits and undo must survive the full project lifecycle.
 await page.locator('#annoList li').first().getByRole('button',{name:'编辑',exact:true}).click();
 await page.fill('#annoNotesEdit','Water verified on reconnaissance');await page.selectOption('#annoVerifiedEdit','verified');
 await page.locator('#annotationForm button[type=submit]').click();assert.equal(await page.evaluate(()=>annos[0].verified),'verified');
 assert.equal(await page.evaluate(()=>annos[0].notes),'Water verified on reconnaissance');
 // Import identity must survive edits, route switching, persistence, deletion and undo.
 const annotationProject=await page.evaluate(()=>serializeProject());
 // Map clicks reveal the matching row inside both the list and the sidebar.
 await page.evaluate(()=>{
   annos.splice(0,annos.length,...Array.from({length:20},(_,i)=>({idx:0,text:`Waypoint ${i+1}`,type:'note',color:'#111827',latlng:[30+i*.001,120]})));
   refreshAnnoMarkers();renderAnnoList();
 });
 const clickWaypoint=async(index,label=false)=>{
   const name=await page.evaluate(({index,label})=>{map.closePopup();map.setView(annos[index].latlng,16,{animate:false});annos[index][label?'labelMarker':'marker'].getElement().setAttribute('data-test-waypoint','target');return annos[index].text;},{index,label});
   await page.locator('[data-test-waypoint="target"]').click({force:true});
   await page.evaluate(()=>document.querySelector('[data-test-waypoint="target"]').removeAttribute('data-test-waypoint'));
   await page.waitForFunction(index=>{
     const li=$('annoList').children[index],r=li.getBoundingClientRect(),list=$('annoList').getBoundingClientRect(),panel=$('panel').getBoundingClientRect();
     return li.classList.contains('anno-selected')&&r.top>=Math.max(list.top,panel.top)&&r.bottom<=Math.min(list.bottom,panel.bottom);
   },index);
   assert.equal(await page.locator('#annoList .anno-selected').count(),1);
   assert.ok((await page.locator('#annoList .anno-selected .t').textContent()).startsWith(name+' ·'));
 };
 await page.click('#tabStitch');await clickWaypoint(5);
 assert.equal(await page.evaluate(()=>window.currentToolMode),'analysis');
 await clickWaypoint(19,true);await clickWaypoint(0);
 // Rebuilt markers must still resolve the right row after an earlier point is deleted.
 await page.evaluate(()=>{annos.splice(1,1);refreshAnnoMarkers();renderAnnoList();});
 await clickWaypoint(5,true);
 await page.evaluate(p=>restoreProject(p),annotationProject);
 const kml='<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Placemark><LineString><coordinates>120,30,100 120.01,30,120</coordinates></LineString></Placemark><Placemark><name>Imported water</name><Point><coordinates>120,30</coordinates></Point></Placemark><Placemark><name>Camp at water</name><Point><coordinates>120,30</coordinates></Point></Placemark></Document></kml>';
 const importedId=await page.evaluate(text=>{const tr=pushImportedTrack(parseKmlText(text,'waypoints.kml'));applyTrackAsActive(tr);redrawActiveRoute();renderTrackList();observeChanges();return tr.id;},kml);
 assert.equal(await page.evaluate(()=>annos.length),2);
 assert.equal(await page.evaluate(()=>new Set(annos.map(a=>a.importId)).size),2);
 // Exercise compatibility: projects saved before import IDs were introduced migrate before editing.
 const legacy=await page.evaluate(()=>{const p=serializeProject();for(const a of p.annotations)delete a.importId;for(const t of p.tracks){for(const pm of t.placemarks||[])delete pm.importId;for(const a of t.annotations||[])delete a.importId;}return p;});
 await page.evaluate(p=>restoreProject(p),legacy);
 const waypointId=await page.evaluate(()=>annos[0].importId);assert.ok(waypointId);
 await page.locator('#annoList li').first().getByRole('button',{name:'编辑',exact:true}).click();
 await page.fill('#annoNameEdit','Relocated water');await page.fill('#annoLatEdit','30.0002');await page.fill('#annoLonEdit','120.0003');
 await page.locator('#annotationForm button[type=submit]').click();
 const assertMoved=async()=>{const a=await page.evaluate(()=>annos.map(a=>({name:a.text,position:a.latlng,id:a.importId})));assert.equal(a.length,2);assert.deepEqual(a.find(a=>a.id===waypointId),{name:'Relocated water',position:[30.0002,120.0003],id:waypointId});assert.equal(a.filter(a=>a.name==='Imported water').length,0);};
 await page.evaluate(()=>redrawActiveRoute());await assertMoved();
 await page.selectOption('#analysisTrackSelect',annotationProject.activeTrackId);await page.selectOption('#analysisTrackSelect',importedId);await assertMoved();
 const movedProject=await page.evaluate(()=>serializeProject());await page.evaluate(p=>restoreProject(p),movedProject);await page.evaluate(()=>redrawActiveRoute());await assertMoved();
 const reexported=await page.evaluate(()=>{const a=parseKmlText(routeToKml(route,annos,'edited'),'edited.kml');const b=parseGpxText(routeToGpx(route,annos,'edited'),'edited.gpx');return [a,b].map(p=>p.annotations.map(a=>({id:a.importId,position:a.latlng})));});
 for(const a of reexported)assert.deepEqual(a.find(a=>a.id===waypointId).position,[30.0002,120.0003]);
 // Delete a moved imported point by its source identity, while retaining the colocated camp.
 await page.evaluate(()=>observeChanges());await page.locator('#annoList li').first().getByRole('button',{name:'删除',exact:true}).click();
 await page.evaluate(()=>{redrawActiveRoute();observeChanges();});assert.equal(await page.evaluate(()=>annos.length),1);
 assert.equal(await page.evaluate(()=>annos[0].text),'Camp at water');
 const removedProject=await page.evaluate(()=>serializeProject());await page.evaluate(p=>restoreProject(p),removedProject);await page.evaluate(()=>redrawActiveRoute());assert.equal(await page.evaluate(()=>annos.length),1);
 await page.click('#undoBtn');await page.evaluate(()=>redrawActiveRoute());await assertMoved();
 await page.click('#redoBtn');await page.evaluate(()=>redrawActiveRoute());assert.equal(await page.evaluate(()=>annos.length),1);
 await page.evaluate(p=>restoreProject(p),annotationProject);await page.evaluate(()=>observeChanges());
 const originalName=await page.evaluate(()=>activeSource);
 await page.fill('#routeNameInput','Leader main route');await page.locator('#routeNameInput').press('Tab');await page.waitForTimeout(100);
 await page.click('#undoBtn');assert.equal(await page.evaluate(()=>activeSource),originalName);
 await page.click('#redoBtn');assert.equal(await page.evaluate(()=>activeSource),'Leader main route');
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('trace_planner_draft_v3')||'null')?.activeSource==='Leader main route');
 await page.evaluate(()=>{window.print=()=>{};printRoadbook();});
 assert.ok((await page.textContent('#roadbook')).includes('Water verified on reconnaissance'));
 assert.equal(await page.evaluate(()=>planRows().some(r=>r.arrival===null)),true);
 await page.emulateMedia({media:'print'});await page.screenshot({path:'/tmp/trace-planner-roadbook.png',fullPage:true});await page.emulateMedia({media:'screen'});
 await page.locator('#panel').evaluate(el=>el.scrollTop=0);
 await page.waitForFunction(()=>map.getSize().x===document.querySelector('#map').clientWidth);await checkScale();
 await page.screenshot({path:'/tmp/trace-planner-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/tmp/trace-planner-mobile.png',fullPage:true});
 await page.waitForFunction(()=>map.getSize().x===document.querySelector('#map').clientWidth);await checkScale();
 await page.setViewportSize({width:320,height:740});await page.waitForFunction(()=>map.getSize().x===320);await checkScale();
 await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>map.getSize().x===390);
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
 assert.ok(await page.locator('#map').evaluate(el=>el.getBoundingClientRect().height)>450);
 await page.click('#langToggle');assert.equal(await page.evaluate(()=>document.documentElement.lang),'en');
 assert.match(await page.locator('.map-scale').getAttribute('aria-label'),/^Scale/);
 assert.equal(await page.locator('#printRoadbookBtn').textContent(),'Print roadbook / Save PDF');
 // Application caching supports an offline revisit; route data remains in the local draft.
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.waitForFunction(()=>navigator.serviceWorker.controller);
 await page.context().setOffline(true);await page.reload();await page.waitForSelector('#leaderPlanner');
 await page.click('#restoreDraftBtn');assert.equal(await page.evaluate(()=>activeSource),'Leader main route');
 await checkScale();
 await page.context().setOffline(false);
 assert.deepEqual(errors,[]);
 console.log('Browser integration passed: import, gaps, annotations, elevation, reversal, stitch, switching, breakpoints, project roundtrip, safe exports, validation, calibrated map scale, mobile, language, offline.');
 await browser.close();server.close();
})().catch(e=>{console.error(e);server.close();process.exit(1);});
