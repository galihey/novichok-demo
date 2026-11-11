// Shared by Node/SQLite and Cloudflare Worker/D1. No cookies, sessions or request logging.
export const OPTIONS = [
  ['Всё понятно', 'Частично', 'Нужна помощь'],
  ['Да', 'Есть сложности', 'Пока не получается'],
  ['Да', 'Есть расхождения', 'Пока сложно сказать']
];
export function day(now = new Date()) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Moscow' }).format(now);
}
export function addWorkdays(date, count) {
  const d = new Date(date + 'T12:00:00Z');
  while (count > 0) { d.setUTCDate(d.getUTCDate() + 1); if (![0, 6].includes(d.getUTCDay())) count--; }
  return d.toISOString().slice(0, 10);
}
export function nextSurvey(start, today = day()) {
  const first = addWorkdays(start, 2);
  let next = first, step = 0;
  while (next < today) next = addWorkdays(next, (++step % 2) ? 3 : 2);
  return { first, next };
}
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: {
  'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
  'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer'
} });
function fail(message, status = 400) { throw Object.assign(new Error(message), { status }); }
function exact(body, fields) {
  if (!body || Array.isArray(body) || typeof body !== 'object' || Object.keys(body).some(k => !fields.includes(k))) fail('Неожиданные поля запроса. Обновите страницу.');
}
function textField(value, name, max = 2000, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail('Проверьте поле «' + name + '».');
  return value.trim();
}
function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value + 'T12:00:00Z')) || new Date(value + 'T12:00:00Z').toISOString().slice(0,10) !== value) fail('Укажите корректный срок.');
  return value;
}
function tableFor(kind) { if (!['named','anonymous'].includes(kind)) fail('Обращение не найдено.', 404); return kind === 'named' ? 'named_reports' : 'anonymous_reports'; }
function decode(row, kind) { return { ...row, kind, answers: JSON.parse(row.answers) }; }
async function all(db, sql, ...params) { return (await db.prepare(sql).bind(...params).all()).results; }
async function first(db, sql, ...params) { return await db.prepare(sql).bind(...params).first(); }
async function run(db, sql, ...params) { return await db.prepare(sql).bind(...params).run(); }
async function getReport(db, kind, id) {
  const row = await first(db, `SELECT * FROM ${tableFor(kind)} WHERE id=?`, id);
  if (!row) fail('Обращение не найдено.',404);
  return decode(row, kind);
}
export async function seed(db) {
  // Fictional reference data only; NOT inside schema migrations.
  await db.batch([
    db.prepare('INSERT OR IGNORE INTO employees VALUES (?,?,?,?,?,?,?,?,?)').bind('demo-anna','Илья Макаров','Магазин · Север','Продавец-консультант','2026-11-09','Консультировать покупателей, выкладывать товар; первые смены — с наставником.','5/2, пн–пт, 09:00–18:00; без вечерних смен.','Оклад 60 000 ₽ до вычета налогов + премия по согласованным показателям.',0),
    db.prepare('UPDATE employees SET name=? WHERE id=?').bind('Илья Макаров','demo-anna'),
    db.prepare('INSERT OR IGNORE INTO employees VALUES (?,?,?,?,?,?,?,?,?)').bind('demo-ivan','Иван Соснов','Склад','Комплектовщик','2026-10-12','Собирать заказы со сканером; обучение и наставник в первую неделю.','2/2, 08:00–20:00.','Оклад 65 000 ₽ до вычета налогов.',1)
  ]);
}
export async function handle(request, db, page, config = {}) {
  const url = new URL(request.url), path = url.pathname;
  if (['/','/editor'].includes(path) && request.method === 'GET') return new Response(page, { headers: {
    'content-type':'text/html; charset=utf-8', 'cache-control':'no-store', 'referrer-policy':'no-referrer',
    'x-content-type-options':'nosniff', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'self' https://chatgpt.com https://chatgpt.site https://*.chatgpt.site"
  }});
  if (!path.startsWith('/api/')) return json({ error:'Страница не найдена.' },404);
  try {
    if (!['GET','POST'].includes(request.method)) fail('Метод не поддерживается.',405);
    if (request.method === 'POST') {
      if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) fail('Запрос с другого сайта запрещён.',403);
      if (!request.headers.get('content-type')?.startsWith('application/json')) fail('Ожидается JSON.',415);
    }
    // Explicit seed endpoint keeps anonymous submission independent of employee reads/writes.
    if (path === '/api/demo/init' && request.method === 'POST') { await seed(db); return json({ ok:true }); }
    if (path === '/api/employee' && request.method === 'GET') {
      const employee = await first(db,'SELECT * FROM employees WHERE id=?','demo-anna');
      if (!employee) fail('Демо ещё не подготовлено.',409);
      const reports = (await all(db,'SELECT * FROM named_reports WHERE employee_id=? ORDER BY rowid DESC','demo-anna')).map(r=>decode(r,'named'));
      let from=day();
      if (reports[0]?.created_day >= from) {
        const after = new Date(reports[0].created_day+'T12:00:00Z');
        after.setUTCDate(after.getUTCDate()+1); from=after.toISOString().slice(0,10);
      }
      return json({ employee, reports, survey:nextSurvey(employee.start_date,from) });
    }
    if (path === '/api/hr' && request.method === 'GET') {
      return json({
        employees:await all(db,'SELECT * FROM employees'),
        reports:[...(await all(db,'SELECT * FROM named_reports ORDER BY rowid DESC')).map(r=>decode(r,'named')), ...(await all(db,'SELECT * FROM anonymous_reports ORDER BY rowid DESC')).map(r=>decode(r,'anonymous'))],
        changes:await all(db,'SELECT * FROM process_changes ORDER BY rowid DESC')
      });
    }
    let body;
    if (request.method === 'POST') {
      const raw = await request.text();
      if (raw.length > (path === '/api/content' ? 100000 : 16000)) fail('Сообщение слишком длинное.',413);
      try { body = JSON.parse(raw); } catch { fail('Не удалось прочитать запрос.'); }
    }
    if (path === '/api/content') {
      if (request.method === 'GET') {
        const saved = await first(db,'SELECT content,revision FROM site_copy WHERE id=1');
        return json({ values:saved?JSON.parse(saved.content):{}, revision:saved?.revision||0, editable:config.ENABLE_TEXT_EDITING === 'true' });
      }
      if (config.ENABLE_TEXT_EDITING !== 'true') fail('Редактирование текстов отключено.',403);
      exact(body,['values','revision']);
      if (!Number.isInteger(body.revision) || body.revision < 0 || !body.values || Array.isArray(body.values) || typeof body.values !== 'object' || Object.keys(body.values).length > 300) fail('Некорректный набор текстов.');
      for (const [key,value] of Object.entries(body.values)) {
        if (!key.trim() || key.length>3000 || typeof value!=='string' || !value.trim() || value.length>3000 || ['__proto__','constructor','prototype'].includes(key)) fail('Тексты должны быть непустыми и не длиннее 3000 символов.');
        if (/\p{Extended_Pictographic}|\p{Regional_Indicator}|\uFE0F|\u20E3/u.test(value)) fail('Эмодзи в интерфейсе не используются.');
      }
      const content=JSON.stringify(body.values);
      if(content.length>90000) fail('Слишком много текста.',413);
      const updated = body.revision===0
        ? await run(db,'INSERT OR IGNORE INTO site_copy (id,content,revision) VALUES (1,?,1)',content)
        : await run(db,'UPDATE site_copy SET content=?,revision=revision+1 WHERE id=1 AND revision=?',content,body.revision);
      if(!updated.meta.changes) fail('Тексты уже изменились в другой вкладке. Закройте редактор и загрузите свежую версию.',409);
      return json({ok:true,revision:body.revision+1});
    }
    if (['/api/named','/api/anonymous'].includes(path) && request.method === 'POST') {
      const kind = path === '/api/named' ? 'named' : 'anonymous';
      exact(body,kind === 'named' ? ['answers','comment','employee_id'] : ['answers','comment']);
      if (!Array.isArray(body.answers) || body.answers.length !== 3 || body.answers.some((v,i)=>!OPTIONS[i].includes(v))) fail('Ответьте на все три вопроса.');
      const comment = textField(body.comment,'Комментарий',2000,false), id = crypto.randomUUID();
      if (kind === 'named') {
        if (body.employee_id !== 'demo-anna') fail('Выберите демо-сотрудника.');
        const e=await first(db,'SELECT departed FROM employees WHERE id=?',body.employee_id);
        if (!e || e.departed) fail('Сотрудник уже уволен. Его обращения сохранены.',409);
        await run(db,'INSERT INTO named_reports (id,employee_id,answers,comment,created_day) VALUES (?,?,?,?,?)',id,body.employee_id,JSON.stringify(body.answers),comment,day());
      } else {
        // No employee ID, session, fingerprint, precise timestamp, or employee-table access.
        await run(db,'INSERT INTO anonymous_reports (id,answers,comment,created_day) VALUES (?,?,?,?)',id,JSON.stringify(body.answers),comment,day());
      }
      return json({ ok:true },201); // Anonymous report ID deliberately not returned.
    }
    const match = path.match(/^\/api\/reports\/(named|anonymous)\/([\w-]+)\/(manage|confirm|process|help)$/);
    if (match && request.method === 'POST') {
      const [,kind,id,operation] = match, report = await getReport(db,kind,id), table = tableFor(kind);
      if(operation==='help') {
        exact(body,['version','owner','due','action','result','verification','resolved']);
        if(!Number.isInteger(body.version)||typeof body.resolved!=='boolean')fail('Обновите страницу и попробуйте ещё раз.');
        if(kind==='named'&&body.resolved)fail('Новичок сам отметит, когда проблема решится.');
        const owner=textField(body.owner,'Кто поможет',120),due=validDate(body.due),action=textField(body.action,'Что нужно сделать'),result=textField(body.result,'Что уже сделано',2000,false),verification=textField(body.verification,'Как проверили результат',2000,false);
        if(kind==='anonymous'&&body.resolved&&(!result||!verification))fail('Напишите, что сделано и как вы проверили результат.');
        const status=kind==='named'?(report.confirmation==='helped'?'resolved':'work'):(body.resolved?'resolved':'work');
        const updated=await run(db,`UPDATE ${table} SET owner=?,due=?,action=?,result=?,hr_check=?,status=?,version=version+1 WHERE id=? AND version=?`,owner,due,action,result,verification,status,id,body.version);
        if(!updated.meta.changes)fail('Обращение уже изменилось. Обновите данные перед сохранением.',409);
        return json({ok:true});
      }
      if (operation === 'manage') {
        exact(body,['version','status','owner','due','action','result','hr_check']);
        if (!Number.isInteger(body.version)) fail('Обновите обращение.');
        const owner=textField(body.owner,'Ответственный',120), due=validDate(body.due), action=textField(body.action,'Конкретное действие'), result=textField(body.result,'Что исправлено',2000,false), hrCheck=textField(body.hr_check,'Проверка HR',2000,false);
        const transitions = { new:['new','work'], work:['work','check'], check:['work','check','resolved'], resolved:['resolved','work'] };
        if (!transitions[report.status].includes(body.status)) fail('Сначала возьмите обращение в работу, затем передайте на проверку.');
        if(kind==='named' && ((body.status==='resolved' && report.confirmation!=='helped') || (report.confirmation==='helped' && body.status!=='resolved'))) fail('Только новичок может отметить, что проблема решена.');
        if (kind === 'named' && report.confirmation === 'helped' && body.status === 'resolved' && (action !== report.action || result !== report.result || owner !== report.owner || due !== report.due)) fail('Новичок подтвердил прежнее исправление. Для нового действия верните обращение в работу.');
        if (['check','resolved'].includes(body.status) && !result) fail('Опишите, что уже исправлено.');
        if (body.status === 'resolved' && kind === 'anonymous' && !hrCheck) fail('Для анонимного обращения укажите результат проверки HR.');
        const updated=await run(db,`UPDATE ${table} SET status=?,owner=?,due=?,action=?,result=?,hr_check=?${kind === 'named' && body.status === 'work' ? ",confirmation=''" : ''},version=version+1 WHERE id=? AND version=?`,body.status,owner,due,action,result,hrCheck,id,body.version);
        if (!updated.meta.changes) fail('Обращение уже изменилось. Обновите страницу и повторите.',409);
        return json({ ok:true });
      }
      if (operation === 'confirm') {
        if (kind !== 'named') fail('У анонимного сообщения нет подтверждения автора.');
        exact(body,['helped','version']);
        if (typeof body.helped !== 'boolean' || !Number.isInteger(body.version)) fail('Выберите результат проверки.');
        const e=await first(db,'SELECT departed FROM employees WHERE id=?',report.employee_id);
        if (e.departed || report.confirmation==='helped' || (!body.helped && report.status!=='check') || report.employee_id !== 'demo-anna') fail('Это обращение сейчас нельзя изменить.',409);
        const updated=await run(db,'UPDATE named_reports SET confirmation=?,status=?,version=version+1 WHERE id=? AND version=?',body.helped?'helped':'not_helped',body.helped?'resolved':'work',id,body.version);
        if (!updated.meta.changes) fail('Обращение уже изменилось. Обновите страницу.',409);
        return json({ ok:true });
      }
      exact(body,['action','owner','due','verification','evidence','done']);
      const action=textField(body.action,'Изменение процесса'), owner=textField(body.owner,'Ответственный',120), due=validDate(body.due), verification=textField(body.verification,'Как проверим'), evidence=textField(body.evidence,'Результат проверки',2000,false);
      if (typeof body.done !== 'boolean' || (body.done && !evidence)) fail('Для выполненного изменения запишите результат проверки.');
      await run(db,'INSERT INTO process_changes (id,source_kind,source_id,action,owner,due,verification,evidence,done) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(source_kind,source_id) DO UPDATE SET action=excluded.action,owner=excluded.owner,due=excluded.due,verification=excluded.verification,evidence=excluded.evidence,done=excluded.done',crypto.randomUUID(),kind,id,action,owner,due,verification,evidence,body.done?1:0);
      return json({ ok:true });
    }
    if (path === '/api/employee/depart' && request.method === 'POST') {
      exact(body,['employee_id']);
      if (!['demo-anna','demo-ivan'].includes(body.employee_id)) fail('Сотрудник не найден.',404);
      // Departure is not a cause attribution; reports and improvements are retained.
      await run(db,'UPDATE employees SET departed=1 WHERE id=?',body.employee_id);
      return json({ ok:true });
    }
    if (path === '/api/demo/reset' && request.method === 'POST') {
      exact(body,['confirm']); if (body.confirm !== 'reset-demo') fail('Подтвердите сброс.');
      await db.batch(['DELETE FROM process_changes','DELETE FROM named_reports','DELETE FROM anonymous_reports','DELETE FROM employees'].map(s=>db.prepare(s)));
      await seed(db); return json({ ok:true });
    }
    return json({ error:'Маршрут не найден.' },404);
  } catch (error) { return json({ error:error.status ? error.message : 'Не удалось сохранить данные. Повторите попытку.' }, error.status || 500); }
}
