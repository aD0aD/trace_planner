const {test}=require('node:test'),assert=require('node:assert/strict');
const ProjectMemory=require('../project-memory.js');
test('photos are lossless, deduplicated and absent from history JSON',()=>{
  const memory=new ProjectMemory(),image='data:image/jpeg;base64,'+'A'.repeat(1024*1024);
  const project={annotations:[{text:'edited waypoint',imageData:image}],tracks:[{placemarks:[{imageData:image}]}]};
  const history=[];
  for(let i=0;i<30;i++){project.annotations[0].text='edit '+i;history.push(memory.capture(project));}
  assert.ok(history.every(s=>s.length<300));assert.equal(memory.images.size,1);
  const portable=memory.portable(history.at(-1));assert.equal(Object.keys(portable.imageAssets).length,1);
  assert.deepEqual(new ProjectMemory().expand(JSON.parse(JSON.stringify(portable))),project);
  assert.deepEqual(memory.expand(project),project);
  assert.equal(memory.expand(JSON.parse(history[0])).annotations[0].text,'edit 0');
});
test('discarded photos are released only when no retained state references them',()=>{
  const memory=new ProjectMemory(),old=memory.capture({imageData:'data:image/png;base64,AAAA'}),current=memory.capture({imageData:null});
  memory.prune([old,current]);assert.equal(memory.images.size,1);
  memory.prune([current]);assert.equal(memory.images.size,0);
  assert.throws(()=>memory.expand(JSON.parse(old)),/Missing project image/);
  assert.throws(()=>memory.expand({imageData:{$traceImage:'1'},imageAssets:{}}),/Missing project image/);
});
test('oversized autosave can be rejected without serializing image payloads',()=>{
  const memory=new ProjectMemory(),snapshot=memory.capture({imageData:'data:image/jpeg;base64,'+'A'.repeat(5*1024*1024)});
  assert.ok(snapshot.length<100);assert.ok(memory.storageUpperBound(snapshot)>4*1024*1024);
});
