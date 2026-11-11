import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
export function openDatabase(filename) {
  const sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;');
  sqlite.exec('CREATE TABLE IF NOT EXISTS _local_migrations (name TEXT PRIMARY KEY)');
  for (const name of readdirSync(new URL('../drizzle/',import.meta.url)).filter(n=>n.endsWith('.sql')).sort()) {
    if (!sqlite.prepare('SELECT name FROM _local_migrations WHERE name=?').get(name)) {
      sqlite.exec('BEGIN');
      try { sqlite.exec(readFileSync(new URL('../drizzle/'+name,import.meta.url),'utf8')); sqlite.prepare('INSERT INTO _local_migrations VALUES (?)').run(name); sqlite.exec('COMMIT'); }
      catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    }
  }
  function statement(sql, params=[]) {
    return {
      bind(...values) { return statement(sql,values); },
      async first() { return sqlite.prepare(sql).get(...params) || null; },
      async all() { return { results:sqlite.prepare(sql).all(...params) }; },
      run() { const r=sqlite.prepare(sql).run(...params); return { meta:{ changes:Number(r.changes) } }; }
    };
  }
  const db = { prepare:statement, async batch(statements) {
    sqlite.exec('BEGIN');
    try { const results=statements.map(s=>s.run()); sqlite.exec('COMMIT'); return results; }
    catch(e) { sqlite.exec('ROLLBACK'); throw e; }
  }, close() { sqlite.close(); }, sqlite };
  return db;
}
