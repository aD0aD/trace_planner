const test=require('node:test'),assert=require('node:assert/strict'),C=require('../dem-core.js');
test('projected terrain corners roundtrip at hiking latitudes',()=>{
  for(const p of [[121,28.35],[120,60],[-120,-35]]){const q=C.unproject(...C.project(...p));assert.ok(Math.abs(q[0]-p[0])<1e-9);assert.ok(Math.abs(q[1]-p[1])<1e-9);}
});
test('pixel centers distinguish GeoTIFF area and point registration',()=>{
  const meta={origin:[121-.0005,29+.0005],resolution:[.001,-.001],pixelIsArea:true};
  const p=C.pixel(121,29,meta);assert.ok(p.every(v=>Math.abs(v)<1e-9));
  assert.deepEqual(C.pixel(121,29,{origin:[121,29],resolution:[.001,-.001],pixelIsArea:false}),[0,-0]);
});
test('NoData stays missing while exact valid centers remain usable',()=>{
  const a=new Float32Array([0,100,200,-9999]);assert.equal(C.bilinear(a,2,2,0,0,-9999),0);
  assert.ok(Number.isNaN(C.bilinear(a,2,2,.5,.5,-9999)));assert.ok(Number.isNaN(C.bilinear(a,2,2,-1,0)));
});
test('large extents stay inside the output pixel budget',()=>{
  const g=C.grid([120,28,122,30],1);assert.ok(g.width*g.height<=C.MAX_PIXELS);assert.ok(g.width<=1400&&g.height<=1400);
});
test('route buffers account for longitude distance at latitude',()=>{
  const b=C.routeBounds([[60,120],[60,121]],2);assert.ok(Math.abs((120-b[0])/(60-b[1])-2)<.001);
  assert.equal(C.intersect([0,0,1,1],[2,0,3,1]),null);
});
test('contours interpolate a ramp and join neighboring cells into one line',()=>{
  const a=new Float32Array([0,100,200,0,100,200,0,100,200]);
  const lines=C.contours(a,3,3,50),line=lines.find(l=>l.elevation===50);
  assert.equal(line.points.length,3);assert.ok(line.points.every(p=>p[0]===1));assert.equal(line.points[0][1],.5);assert.equal(line.points.at(-1)[1],2.5);
});
test('contours and pixels never bridge missing terrain',()=>{
  const a=new Float32Array([0,100,200,0,NaN,200,0,100,200]);assert.deepEqual(C.contours(a,3,3,20),[]);
  const painted=C.paint(a,{width:3,height:3,top:10,bottom:0,dx:30,dy:30},true);assert.equal(painted.rgba[4*4+3],0);assert.equal(painted.known,8);
});
test('saddle contours are two noncrossing paths and density is bounded',()=>{
  const lines=C.contours(new Float32Array([0,100,100,0]),2,2,50).filter(l=>l.elevation===50);
  assert.equal(lines.length,2);assert.ok(lines.every(l=>l.points.length===2));
  assert.throws(()=>C.contours(new Float32Array([0,100,0,100]),2,2,10,1),/dense/);
});
