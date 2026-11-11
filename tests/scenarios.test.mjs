import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { openDatabase } from '../scripts/database.mjs';
import { handle, seed, addWorkdays, nextSurvey } from '../src/core.js';
const page=readFileSync(new URL('../src/index.html',import.meta.url),'utf8');
const answers=['Всё понятно','Есть сложности','Есть расхождения'];
const report={answers,comment:'Обещали 09:00–18:00, поставили до 22:00.'};
const plan={owner:'Мария, руководитель магазина',due:'2026-11-13',action:'Исправить расписание Анны на 09:00–18:00.',result:'',hr_check:'',status:'work'};
const change={action:'Включить график в письменное предложение и сверять его до первой смены.',owner:'Ольга, подбор',due:'2026-11-20',verification:'Сверить обещанный и реальный график у следующих трёх новичков.',evidence:'',done:false};
async function fixture(){const db=openDatabase(':memory:');await seed(db);const call=async(path,body)=>{const r=await handle(new Request('http://demo.test/api/'+path,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json','origin':'http://demo.test'},body:JSON.stringify(body)}),db,page);return {status:r.status,data:await r.json(),headers:r.headers}};return {db,call};}
async function latest(call,kind='named'){return (await call('hr')).data.reports.find(r=>r.kind===kind)}
test('Главный сценарий: расхождение → назначение → исправление → подтверждение → изменение найма',async()=>{
  const {db,call}=await fixture();try{
    assert.equal((await call('named',{...report,employee_id:'demo-anna'})).status,201);
    let r=await latest(call);assert.equal(r.status,'new');assert.equal(r.employee_id,'demo-anna');
    assert.match((await call('hr')).data.employees[0].schedule,/09:00–18:00/);
    assert.equal((await call(`reports/named/${r.id}/manage`,{...plan,version:r.version})).status,200);
    r=await latest(call);assert.equal(r.owner,plan.owner);assert.equal(r.status,'work');
    assert.equal((await call(`reports/named/${r.id}/manage`,{...plan,status:'check',result:'Расписание исправлено, вечерние смены убраны.',version:r.version})).status,200);
    r=await latest(call);assert.equal(r.status,'check');assert.equal(r.confirmation,'');
    assert.equal((await call(`reports/named/${r.id}/manage`,{...plan,status:'resolved',result:'Исправлено',version:r.version})).status,400);
    assert.equal((await call(`reports/named/${r.id}/confirm`,{helped:true,version:r.version})).status,200);
    r=await latest(call);assert.equal(r.status,'resolved');assert.equal(r.confirmation,'helped');
    assert.equal((await call(`reports/named/${r.id}/manage`,{...plan,status:'resolved',result:'Другое исправление',version:r.version})).status,400);
    assert.equal((await call(`reports/named/${r.id}/process`,change)).status,200);
    const h=(await call('hr')).data;assert.equal(h.changes.length,1);assert.equal(h.changes[0].done,0);assert.equal(h.changes[0].verification,change.verification);
    assert.equal((await call(`reports/named/${r.id}/process`,{...change,done:true})).status,400);
    assert.equal((await call(`reports/named/${r.id}/process`,{...change,done:true,evidence:'В демо проверено наличие графика в обновлённом шаблоне; эффект на следующих новичках не измерен.'})).status,200);
    assert.equal((await call('employee')).data.reports.length,1);
  }finally{db.close()}
});
test('«Не помогло» возвращает обращение в работу; устаревшая версия не перезаписывает изменения',async()=>{
  const {db,call}=await fixture();try{
    await call('named',{...report,employee_id:'demo-anna'});let r=await latest(call);
    await call(`reports/named/${r.id}/manage`,{...plan,version:r.version});
    assert.equal((await call(`reports/named/${r.id}/manage`,{...plan,version:r.version})).status,409);
    r=await latest(call);await call(`reports/named/${r.id}/manage`,{...plan,status:'check',result:'Исправлено',version:r.version});r=await latest(call);
    assert.equal((await call(`reports/named/${r.id}/confirm`,{helped:false,version:r.version})).status,200);
    r=await latest(call);assert.equal(r.status,'work');assert.equal(r.confirmation,'not_helped');
  }finally{db.close()}
});
test('Анонимный канал: только ответы и текст; нет связи, ID автора, личной истории и подтверждения',async()=>{
  const {db,call}=await fixture();try{
    const before=(await call('employee')).data;
    assert.equal((await call('anonymous',{...report,employee_id:'demo-anna'})).status,400);
    assert.equal((await call('anonymous',{...report,session_id:'hidden'})).status,400);
    assert.equal((await call('anonymous',{...report,fingerprint:'hidden'})).status,400);
    const response=await call('anonymous',report);assert.equal(response.status,201);assert.deepEqual(response.data,{ok:true});assert.equal(response.headers.get('set-cookie'),null);
    const r=await latest(call,'anonymous');assert.equal('employee_id' in r,false);assert.equal('confirmation' in r,false);assert.equal('created_at' in r,false);
    const columns=db.sqlite.prepare('PRAGMA table_info(anonymous_reports)').all().map(c=>c.name);
    assert.ok(!columns.some(c=>/employee|session|fingerprint|confirm|created_at/.test(c)));
    assert.deepEqual(db.sqlite.prepare('PRAGMA foreign_key_list(anonymous_reports)').all(),[]);
    const after=(await call('employee')).data;assert.equal(after.reports.length,0);assert.deepEqual(after.survey,before.survey);
    assert.equal((await call(`reports/anonymous/${r.id}/confirm`,{helped:true,version:r.version})).status,400);
    await call(`reports/anonymous/${r.id}/manage`,{...plan,version:r.version});let current=await latest(call,'anonymous');
    await call(`reports/anonymous/${r.id}/manage`,{...plan,status:'check',result:'Обновлён общий график.',version:current.version});current=await latest(call,'anonymous');
    assert.equal((await call(`reports/anonymous/${r.id}/manage`,{...plan,status:'resolved',result:'Обновлён график.',version:current.version})).status,400);
    assert.equal((await call(`reports/anonymous/${r.id}/manage`,{...plan,status:'resolved',result:'Обновлён график.',hr_check:'HR сверил утверждённое расписание. Подтверждения автора нет.',version:current.version})).status,200);
    // Even without any employees present, anonymous submission needs no employee records.
    db.sqlite.exec('DELETE FROM employees');assert.equal((await call('anonymous',report)).status,201);
  }finally{db.close()}
});
test('Валидация пустых/неверных ответов и обязательных полей; комментарий необязателен',async()=>{
  const {db,call}=await fixture();try{
    for(const body of [{},{answers:[],comment:''},{answers:['','',''],comment:''},{answers:[...answers,'лишнее'],comment:''},{answers,comment:'x'.repeat(2001)},{answers,comment:42}])assert.equal((await call('anonymous',body)).status,400);
    assert.equal((await call('anonymous',{answers,comment:'   '})).status,201);
    await call('named',{...report,employee_id:'demo-anna'});const r=await latest(call);
    for(const invalid of [{owner:''},{action:'   '},{due:'2026-02-30'},{due:'invalid'},{status:'resolved'},{status:'check',result:'готово'},{version:'1'}])assert.equal((await call(`reports/named/${r.id}/manage`,{...plan,version:r.version,...invalid})).status,400);
    assert.equal((await call(`reports/named/${r.id}/confirm`,{helped:'yes',version:r.version})).status,400);
  }finally{db.close()}
});
test('Увольнение сохраняет проблему и план, но HR не закрывает именное обращение',async()=>{
  const {db,call}=await fixture();try{
    await call('named',{...report,employee_id:'demo-anna'});let r=await latest(call);
    await call(`reports/named/${r.id}/manage`,{...plan,version:r.version});r=await latest(call);
    await call(`reports/named/${r.id}/manage`,{...plan,status:'check',result:'График исправлен.',version:r.version});r=await latest(call);
    await call(`reports/named/${r.id}/process`,change);
    await call('employee/depart',{employee_id:'demo-anna'});
    assert.equal((await call('named',{...report,employee_id:'demo-anna'})).status,409);
    assert.equal((await call(`reports/named/${r.id}/confirm`,{helped:true,version:r.version})).status,409);
    assert.equal((await call('employee')).data.reports.length,1);assert.equal((await call('hr')).data.changes.length,1);
    assert.equal((await call(`reports/named/${r.id}/manage`,{...plan,status:'resolved',result:'График исправлен.',version:r.version})).status,400);
    assert.equal((await call(`reports/named/${r.id}/manage`,{...plan,status:'resolved',result:'График исправлен.',hr_check:'HR проверил расписание. Причина ухода неизвестна.',version:r.version})).status,400);
    assert.equal((await latest(call)).confirmation,'');
  }finally{db.close()}
});
test('Расписание учитывает выходные, первый опрос через 2 рабочих дня, дальше 3/2',()=>{
  assert.equal(addWorkdays('2026-11-06',2),'2026-11-10');
  assert.deepEqual(nextSurvey('2026-11-09','2026-11-11'),{first:'2026-11-11',next:'2026-11-11'});
  assert.equal(nextSurvey('2026-11-09','2026-11-12').next,'2026-11-16');
  assert.equal(nextSurvey('2026-11-09','2026-11-17').next,'2026-11-18');
});
test('Запросы с другого сайта блокируются; отсутствует кэширование и произвольный маршрут',async()=>{
  const {db,call}=await fixture();try{
    const r=await handle(new Request('http://demo.test/api/anonymous',{method:'POST',headers:{origin:'http://elsewhere.test','content-type':'application/json'},body:JSON.stringify(report)}),db,page);assert.equal(r.status,403);
    assert.equal((await call('not-found')).status,404);
    const h=await call('hr');assert.equal(h.headers.get('cache-control'),'no-store');
    const bad=await handle(new Request('http://demo.test/api/anonymous',{method:'POST',headers:{'content-type':'application/json'},body:'{bad'}),db,page);assert.equal(bad.status,400);
  }finally{db.close()}
});
test('Данные переживают закрытие SQLite и повторное применение миграций',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'novichok-test-')), file=join(dir,'test.sqlite');let db=openDatabase(file);
  try{
    await seed(db);
    const request=new Request('http://demo.test/api/named',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({...report,employee_id:'demo-anna'})});
    assert.equal((await handle(request,db,page)).status,201);db.close();db=openDatabase(file);
    assert.equal((await db.prepare('SELECT * FROM named_reports').all()).results.length,1);
    assert.equal((await db.prepare('SELECT * FROM _local_migrations').all()).results.length,2);
  }finally{db.close();rmSync(dir,{recursive:true,force:true})}
});
test('Реальный HTTP-сервер: данные доступны после остановки и запуска нового процесса',async()=>{
  const dir=mkdtempSync(join(tmpdir(),'novichok-http-'));const port=4189;let child;
  async function start(){child=spawn(process.execPath,['scripts/local.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:String(port),DEMO_DB:join(dir,'http.sqlite')},stdio:['ignore','pipe','pipe'],windowsHide:true});let output='';await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(new Error('HTTP server startup timed out: '+output)),10000);child.stdout.on('data',d=>{output+=d;if(output.includes('http://')){clearTimeout(timeout);resolve()}});child.once('error',e=>{clearTimeout(timeout);reject(e)});child.once('exit',code=>{clearTimeout(timeout);reject(new Error('Server exited '+code))})})}
  async function stop(){if(child&&child.exitCode===null){const exited=once(child,'exit');child.kill();await exited}}
  const call=async(path,body)=>{const r=await fetch(`http://127.0.0.1:${port}/api/${path}`,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return {status:r.status,data:await r.json()}};
  try{await start();await call('demo/init',{});assert.equal((await call('named',{...report,employee_id:'demo-anna'})).status,201);assert.equal((await call('anonymous',report)).status,201);await stop();await start();const h=(await call('hr')).data;assert.equal(h.reports.length,2);assert.equal((await call('employee')).data.reports.length,1)}finally{await stop();rmSync(dir,{recursive:true,force:true})}
});
