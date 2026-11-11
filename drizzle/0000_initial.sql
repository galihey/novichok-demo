CREATE TABLE employees (
 id TEXT PRIMARY KEY,
 name TEXT NOT NULL,
 team TEXT NOT NULL,
 role TEXT NOT NULL,
 start_date TEXT NOT NULL,
 duties TEXT NOT NULL,
 schedule TEXT NOT NULL,
 pay TEXT NOT NULL,
 departed INTEGER NOT NULL DEFAULT 0 CHECK (departed IN (0,1))
);
--> statement-breakpoint
CREATE TABLE named_reports (
 id TEXT PRIMARY KEY,
 employee_id TEXT NOT NULL REFERENCES employees(id),
 answers TEXT NOT NULL,
 comment TEXT NOT NULL,
 created_day TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','work','check','resolved')),
 owner TEXT NOT NULL DEFAULT '',
 due TEXT NOT NULL DEFAULT '',
 action TEXT NOT NULL DEFAULT '',
 result TEXT NOT NULL DEFAULT '',
 confirmation TEXT NOT NULL DEFAULT '',
 hr_check TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE anonymous_reports (
 id TEXT PRIMARY KEY,
 answers TEXT NOT NULL,
 comment TEXT NOT NULL,
 created_day TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','work','check','resolved')),
 owner TEXT NOT NULL DEFAULT '',
 due TEXT NOT NULL DEFAULT '',
 action TEXT NOT NULL DEFAULT '',
 result TEXT NOT NULL DEFAULT '',
 hr_check TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL DEFAULT 1
);
--> statement-breakpoint
CREATE TABLE process_changes (
 id TEXT PRIMARY KEY,
 source_kind TEXT NOT NULL CHECK (source_kind IN ('named','anonymous')),
 source_id TEXT NOT NULL,
 action TEXT NOT NULL,
 owner TEXT NOT NULL,
 due TEXT NOT NULL,
 verification TEXT NOT NULL,
 evidence TEXT NOT NULL DEFAULT '',
 done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0,1)),
 UNIQUE(source_kind, source_id)
);
