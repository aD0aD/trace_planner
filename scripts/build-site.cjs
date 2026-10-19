/* Explicit public-file list: route fixtures, generated output and dev tools stay local. */
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),site=path.join(root,'site');
const files=['index.html','Trace_planner.html','route-core.js','project-memory.js','planner.js','sidebar.js','planner.css','dem-core.js','dem-worker.js','terrain-layer.js','sw.js','LICENSE'];
fs.rmSync(site,{recursive:true,force:true});fs.mkdirSync(site);
for(const name of files)fs.copyFileSync(path.join(root,name),path.join(site,name));
for(const name of ['assets','vendor'])fs.cpSync(path.join(root,name),path.join(site,name),{recursive:true});
fs.writeFileSync(path.join(site,'.nojekyll'),'');
console.log('Pages site assembled with application assets only.');
