import test from 'node:test';
import assert from 'node:assert/strict';
import {handle,seed} from '../src/core.js';
import {openDatabase} from '../scripts/database.mjs';
test('Простая помощь HR: назначение, решение новичком, анонимная проверка и план',async()=>{
 const db=openDatabase(':memory:');await seed(db);
 const call=async(path,body)=>{const r=await handle(new Request('https://demo.test/api/'+path,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),db,'');return {status:r.status,data:await r.json()}};
 const input={answers:['Частично','Есть сложности','Есть расхождения'],comment:'Проблема с графиком'};
 const plan={owner:'Мария',due:'2026-11-20',action:'Исправить график',result:'',verification:'',resolved:false};
 try{
  await call('named',{...input,employee_id:'demo-anna'});let r=(await call('employee')).data.reports[0];const id=r.id;
  assert.equal((await call(`reports/named/${id}/help`,{...plan,version:r.version})).status,200);
  assert.equal((await call(`reports/named/${id}/help`,{...plan,version:r.version})).status,409);
  r=(await call('employee')).data.reports[0];assert.equal(r.owner,'Мария');assert.equal(r.action,plan.action);
  assert.equal((await call(`reports/named/${id}/help`,{...plan,version:r.version,resolved:true})).status,400);
  await call(`reports/named/${id}/confirm`,{version:r.version,helped:true});r=(await call('employee')).data.reports[0];
  assert.equal((await call(`reports/named/${id}/help`,{...plan,version:r.version,result:'График исправлен'})).status,200);
  assert.equal((await call('employee')).data.reports[0].confirmation,'helped');
  await call('anonymous',input);let a=(await call('hr')).data.reports.find(r=>r.kind==='anonymous');
  assert.equal((await call(`reports/anonymous/${a.id}/help`,{...plan,version:a.version,resolved:true})).status,400);
  assert.equal((await call(`reports/anonymous/${a.id}/help`,{...plan,version:a.version,resolved:true,result:'Исправили',verification:'Сверили график'})).status,200);
  a=(await call('hr')).data.reports.find(r=>r.id===a.id);assert.equal(a.status,'resolved');assert.ok(!('employee_id'in a));assert.ok(!('confirmation'in a));
  assert.equal((await call(`reports/named/${id}/process`,{action:'Указывать график при найме',owner:'Подбор',due:'2026-11-25',verification:'Спросить следующих новичков',evidence:'',done:false})).status,200);
  assert.equal((await call('hr')).data.changes.length,1);
 }finally{db.close()}
});
