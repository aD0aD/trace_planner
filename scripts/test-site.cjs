const path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
require('./build-site.cjs');
for(const name of ['sidebar-browser.test.cjs','browser.test.cjs','dem-browser.test.cjs','memory-browser.test.cjs']) {
  const result=spawnSync(process.execPath,[path.join(root,'tests',name)],{cwd:root,stdio:'inherit',env:{...process.env,TRACE_TEST_ROOT:path.join(root,'site')}});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}
