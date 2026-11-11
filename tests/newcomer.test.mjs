import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase} from '../scripts/database.mjs';
import {handle,seed} from '../src/core.js';
test('Новичок сам закрывает принятое обращение без действий HR; HR не меняет его решение',async()=>{
 const db=openDatabase(':memory:');await seed(db);
 const call=async(path,body)=>{const r=await handle(new Request('https://demo.test/api/'+path,body===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}),db,'');return {status:r.status,data:await r.json()}};
 try{
  await call('named',{employee_id:'demo-anna',answers:['Частично','Есть сложности','Да'],comment:'Нужна помощь'});
  let r=(await call('employee')).data.reports[0];assert.equal(r.status,'new');
  const id=r.id;
  assert.equal((await call('reports/named/'+id+'/confirm',{helped:true,version:r.version})).status,200);
  r=(await call('employee')).data.reports[0];assert.equal(r.confirmation,'helped');assert.equal(r.status,'resolved');
  assert.equal((await call('reports/named/'+id+'/confirm',{helped:true,version:r.version-1})).status,409);
  assert.equal((await call('reports/named/'+id+'/manage',{version:r.version,status:'work',owner:'HR',due:'2026-11-20',action:'Новое действие',result:'',hr_check:''})).status,400);
  await call('named',{employee_id:'demo-anna',answers:['Частично','Есть сложности','Да'],comment:'Ещё вопрос'});
  const before=(await call('employee')).data.reports;
  await call('anonymous',{answers:['Частично','Есть сложности','Да'],comment:'Анонимный вопрос'});
  assert.equal((await call('employee')).data.reports.length,before.length);
  assert.equal((await call('employee')).data.reports.find(x=>x.id===id).confirmation,'helped');
 }finally{db.close()}
});
test('Редактор имеет отдельный адрес',async()=>{
 const db=openDatabase(':memory:');try{
  assert.equal((await handle(new Request('https://demo.test/editor'),db,'<html>editor</html>')).status,200);
  assert.equal((await handle(new Request('https://demo.test/other'),db,'')).status,404);
 }finally{db.close()}
});
