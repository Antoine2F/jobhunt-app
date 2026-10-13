-- Généré par scripts/gen-schema.ts : ne pas modifier à la main.
-- Idempotent : crée les tables et colonnes manquantes.

IF OBJECT_ID(N'dbo.[companies]', N'U') IS NULL
CREATE TABLE dbo.[companies] (
  id NVARCHAR(36) NOT NULL PRIMARY KEY,
  created_at DATETIMEOFFSET NOT NULL,
  updated_at DATETIMEOFFSET NOT NULL
);
IF COL_LENGTH(N'dbo.[companies]', N'name') IS NULL ALTER TABLE dbo.[companies] ADD [name] NVARCHAR(200) NULL;
IF COL_LENGTH(N'dbo.[companies]', N'sector') IS NULL ALTER TABLE dbo.[companies] ADD [sector] NVARCHAR(120) NULL;
IF COL_LENGTH(N'dbo.[companies]', N'size') IS NULL ALTER TABLE dbo.[companies] ADD [size] NVARCHAR(60) NULL;
IF COL_LENGTH(N'dbo.[companies]', N'website') IS NULL ALTER TABLE dbo.[companies] ADD [website] NVARCHAR(400) NULL;
IF COL_LENGTH(N'dbo.[companies]', N'description') IS NULL ALTER TABLE dbo.[companies] ADD [description] NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.[companies]', N'funding') IS NULL ALTER TABLE dbo.[companies] ADD [funding] NVARCHAR(200) NULL;
IF COL_LENGTH(N'dbo.[companies]', N'headquarters') IS NULL ALTER TABLE dbo.[companies] ADD [headquarters] NVARCHAR(200) NULL;
IF COL_LENGTH(N'dbo.[companies]', N'knowledge_path') IS NULL ALTER TABLE dbo.[companies] ADD [knowledge_path] NVARCHAR(400) NULL;
IF COL_LENGTH(N'dbo.[companies]', N'notes') IS NULL ALTER TABLE dbo.[companies] ADD [notes] NVARCHAR(MAX) NULL;
GO

IF OBJECT_ID(N'dbo.[offers]', N'U') IS NULL
CREATE TABLE dbo.[offers] (
  id NVARCHAR(36) NOT NULL PRIMARY KEY,
  created_at DATETIMEOFFSET NOT NULL,
  updated_at DATETIMEOFFSET NOT NULL
);
IF COL_LENGTH(N'dbo.[offers]', N'company_id') IS NULL ALTER TABLE dbo.[offers] ADD [company_id] NVARCHAR(36) NULL;
IF COL_LENGTH(N'dbo.[offers]', N'title') IS NULL ALTER TABLE dbo.[offers] ADD [title] NVARCHAR(300) NULL;
IF COL_LENGTH(N'dbo.[offers]', N'location') IS NULL ALTER TABLE dbo.[offers] ADD [location] NVARCHAR(200) NULL;
IF COL_LENGTH(N'dbo.[offers]', N'remote') IS NULL ALTER TABLE dbo.[offers] ADD [remote] NVARCHAR(120) NULL;
IF COL_LENGTH(N'dbo.[offers]', N'contract') IS NULL ALTER TABLE dbo.[offers] ADD [contract] NVARCHAR(60) NULL;
IF COL_LENGTH(N'dbo.[offers]', N'salary') IS NULL ALTER TABLE dbo.[offers] ADD [salary] NVARCHAR(120) NULL;
IF COL_LENGTH(N'dbo.[offers]', N'source') IS NULL ALTER TABLE dbo.[offers] ADD [source] NVARCHAR(20) NULL;
IF COL_LENGTH(N'dbo.[offers]', N'source_detail') IS NULL ALTER TABLE dbo.[offers] ADD [source_detail] NVARCHAR(200) NULL;
IF COL_LENGTH(N'dbo.[offers]', N'url') IS NULL ALTER TABLE dbo.[offers] ADD [url] NVARCHAR(1000) NULL;
IF COL_LENGTH(N'dbo.[offers]', N'url_key') IS NULL ALTER TABLE dbo.[offers] ADD [url_key] NVARCHAR(400) NULL;
IF COL_LENGTH(N'dbo.[offers]', N'description') IS NULL ALTER TABLE dbo.[offers] ADD [description] NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.[offers]', N'status') IS NULL ALTER TABLE dbo.[offers] ADD [status] NVARCHAR(20) NULL;
IF COL_LENGTH(N'dbo.[offers]', N'approach') IS NULL ALTER TABLE dbo.[offers] ADD [approach] NVARCHAR(20) NULL;
IF COL_LENGTH(N'dbo.[offers]', N'score') IS NULL ALTER TABLE dbo.[offers] ADD [score] INT NULL;
IF COL_LENGTH(N'dbo.[offers]', N'score_reason') IS NULL ALTER TABLE dbo.[offers] ADD [score_reason] NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.[offers]', N'decision_note') IS NULL ALTER TABLE dbo.[offers] ADD [decision_note] NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.[offers]', N'received_at') IS NULL ALTER TABLE dbo.[offers] ADD [received_at] DATETIMEOFFSET NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_offers_status') CREATE INDEX ix_offers_status ON dbo.[offers] ([status]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_offers_company_id') CREATE INDEX ix_offers_company_id ON dbo.[offers] ([company_id]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_offers_url_key') CREATE INDEX ix_offers_url_key ON dbo.[offers] ([url_key]);
GO

IF OBJECT_ID(N'dbo.[processes]', N'U') IS NULL
CREATE TABLE dbo.[processes] (
  id NVARCHAR(36) NOT NULL PRIMARY KEY,
  created_at DATETIMEOFFSET NOT NULL,
  updated_at DATETIMEOFFSET NOT NULL
);
IF COL_LENGTH(N'dbo.[processes]', N'offer_id') IS NULL ALTER TABLE dbo.[processes] ADD [offer_id] NVARCHAR(36) NULL;
IF COL_LENGTH(N'dbo.[processes]', N'stage') IS NULL ALTER TABLE dbo.[processes] ADD [stage] NVARCHAR(20) NULL;
IF COL_LENGTH(N'dbo.[processes]', N'next_step') IS NULL ALTER TABLE dbo.[processes] ADD [next_step] NVARCHAR(300) NULL;
IF COL_LENGTH(N'dbo.[processes]', N'next_step_date') IS NULL ALTER TABLE dbo.[processes] ADD [next_step_date] DATE NULL;
IF COL_LENGTH(N'dbo.[processes]', N'contact_name') IS NULL ALTER TABLE dbo.[processes] ADD [contact_name] NVARCHAR(200) NULL;
IF COL_LENGTH(N'dbo.[processes]', N'notes') IS NULL ALTER TABLE dbo.[processes] ADD [notes] NVARCHAR(MAX) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_processes_offer_id') CREATE INDEX ix_processes_offer_id ON dbo.[processes] ([offer_id]);
GO

IF OBJECT_ID(N'dbo.[interviews]', N'U') IS NULL
CREATE TABLE dbo.[interviews] (
  id NVARCHAR(36) NOT NULL PRIMARY KEY,
  created_at DATETIMEOFFSET NOT NULL,
  updated_at DATETIMEOFFSET NOT NULL
);
IF COL_LENGTH(N'dbo.[interviews]', N'process_id') IS NULL ALTER TABLE dbo.[interviews] ADD [process_id] NVARCHAR(36) NULL;
IF COL_LENGTH(N'dbo.[interviews]', N'scheduled_at') IS NULL ALTER TABLE dbo.[interviews] ADD [scheduled_at] DATETIMEOFFSET NULL;
IF COL_LENGTH(N'dbo.[interviews]', N'kind') IS NULL ALTER TABLE dbo.[interviews] ADD [kind] NVARCHAR(80) NULL;
IF COL_LENGTH(N'dbo.[interviews]', N'interviewers') IS NULL ALTER TABLE dbo.[interviews] ADD [interviewers] NVARCHAR(400) NULL;
IF COL_LENGTH(N'dbo.[interviews]', N'status') IS NULL ALTER TABLE dbo.[interviews] ADD [status] NVARCHAR(20) NULL;
IF COL_LENGTH(N'dbo.[interviews]', N'prep_path') IS NULL ALTER TABLE dbo.[interviews] ADD [prep_path] NVARCHAR(400) NULL;
IF COL_LENGTH(N'dbo.[interviews]', N'notes') IS NULL ALTER TABLE dbo.[interviews] ADD [notes] NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.[interviews]', N'outcome') IS NULL ALTER TABLE dbo.[interviews] ADD [outcome] NVARCHAR(MAX) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_interviews_process_id') CREATE INDEX ix_interviews_process_id ON dbo.[interviews] ([process_id]);
GO

IF OBJECT_ID(N'dbo.[people]', N'U') IS NULL
CREATE TABLE dbo.[people] (
  id NVARCHAR(36) NOT NULL PRIMARY KEY,
  created_at DATETIMEOFFSET NOT NULL,
  updated_at DATETIMEOFFSET NOT NULL
);
IF COL_LENGTH(N'dbo.[people]', N'name') IS NULL ALTER TABLE dbo.[people] ADD [name] NVARCHAR(200) NULL;
IF COL_LENGTH(N'dbo.[people]', N'company_id') IS NULL ALTER TABLE dbo.[people] ADD [company_id] NVARCHAR(36) NULL;
IF COL_LENGTH(N'dbo.[people]', N'company_name') IS NULL ALTER TABLE dbo.[people] ADD [company_name] NVARCHAR(200) NULL;
IF COL_LENGTH(N'dbo.[people]', N'role') IS NULL ALTER TABLE dbo.[people] ADD [role] NVARCHAR(200) NULL;
IF COL_LENGTH(N'dbo.[people]', N'past_companies') IS NULL ALTER TABLE dbo.[people] ADD [past_companies] NVARCHAR(600) NULL;
IF COL_LENGTH(N'dbo.[people]', N'linkedin_url') IS NULL ALTER TABLE dbo.[people] ADD [linkedin_url] NVARCHAR(400) NULL;
IF COL_LENGTH(N'dbo.[people]', N'email') IS NULL ALTER TABLE dbo.[people] ADD [email] NVARCHAR(200) NULL;
IF COL_LENGTH(N'dbo.[people]', N'phone') IS NULL ALTER TABLE dbo.[people] ADD [phone] NVARCHAR(40) NULL;
IF COL_LENGTH(N'dbo.[people]', N'strength') IS NULL ALTER TABLE dbo.[people] ADD [strength] INT NULL;
IF COL_LENGTH(N'dbo.[people]', N'tags') IS NULL ALTER TABLE dbo.[people] ADD [tags] NVARCHAR(400) NULL;
IF COL_LENGTH(N'dbo.[people]', N'notes') IS NULL ALTER TABLE dbo.[people] ADD [notes] NVARCHAR(MAX) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_people_company_id') CREATE INDEX ix_people_company_id ON dbo.[people] ([company_id]);
GO

IF OBJECT_ID(N'dbo.[meetings]', N'U') IS NULL
CREATE TABLE dbo.[meetings] (
  id NVARCHAR(36) NOT NULL PRIMARY KEY,
  created_at DATETIMEOFFSET NOT NULL,
  updated_at DATETIMEOFFSET NOT NULL
);
IF COL_LENGTH(N'dbo.[meetings]', N'person_id') IS NULL ALTER TABLE dbo.[meetings] ADD [person_id] NVARCHAR(36) NULL;
IF COL_LENGTH(N'dbo.[meetings]', N'status') IS NULL ALTER TABLE dbo.[meetings] ADD [status] NVARCHAR(20) NULL;
IF COL_LENGTH(N'dbo.[meetings]', N'planned_at') IS NULL ALTER TABLE dbo.[meetings] ADD [planned_at] DATETIMEOFFSET NULL;
IF COL_LENGTH(N'dbo.[meetings]', N'topic') IS NULL ALTER TABLE dbo.[meetings] ADD [topic] NVARCHAR(300) NULL;
IF COL_LENGTH(N'dbo.[meetings]', N'offer_id') IS NULL ALTER TABLE dbo.[meetings] ADD [offer_id] NVARCHAR(36) NULL;
IF COL_LENGTH(N'dbo.[meetings]', N'outcome') IS NULL ALTER TABLE dbo.[meetings] ADD [outcome] NVARCHAR(MAX) NULL;
IF COL_LENGTH(N'dbo.[meetings]', N'next_actions') IS NULL ALTER TABLE dbo.[meetings] ADD [next_actions] NVARCHAR(MAX) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_meetings_person_id') CREATE INDEX ix_meetings_person_id ON dbo.[meetings] ([person_id]);
GO

IF OBJECT_ID(N'dbo.[introductions]', N'U') IS NULL
CREATE TABLE dbo.[introductions] (
  id NVARCHAR(36) NOT NULL PRIMARY KEY,
  created_at DATETIMEOFFSET NOT NULL,
  updated_at DATETIMEOFFSET NOT NULL
);
IF COL_LENGTH(N'dbo.[introductions]', N'introducer_id') IS NULL ALTER TABLE dbo.[introductions] ADD [introducer_id] NVARCHAR(36) NULL;
IF COL_LENGTH(N'dbo.[introductions]', N'introduced_id') IS NULL ALTER TABLE dbo.[introductions] ADD [introduced_id] NVARCHAR(36) NULL;
IF COL_LENGTH(N'dbo.[introductions]', N'target_company_id') IS NULL ALTER TABLE dbo.[introductions] ADD [target_company_id] NVARCHAR(36) NULL;
IF COL_LENGTH(N'dbo.[introductions]', N'offer_id') IS NULL ALTER TABLE dbo.[introductions] ADD [offer_id] NVARCHAR(36) NULL;
IF COL_LENGTH(N'dbo.[introductions]', N'status') IS NULL ALTER TABLE dbo.[introductions] ADD [status] NVARCHAR(20) NULL;
IF COL_LENGTH(N'dbo.[introductions]', N'notes') IS NULL ALTER TABLE dbo.[introductions] ADD [notes] NVARCHAR(MAX) NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_introductions_introducer_id') CREATE INDEX ix_introductions_introducer_id ON dbo.[introductions] ([introducer_id]);
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_introductions_introduced_id') CREATE INDEX ix_introductions_introduced_id ON dbo.[introductions] ([introduced_id]);
GO

IF OBJECT_ID(N'dbo.[ingested_messages]', N'U') IS NULL
CREATE TABLE dbo.[ingested_messages] (
  id NVARCHAR(36) NOT NULL PRIMARY KEY,
  created_at DATETIMEOFFSET NOT NULL,
  updated_at DATETIMEOFFSET NOT NULL
);
IF COL_LENGTH(N'dbo.[ingested_messages]', N'message_id') IS NULL ALTER TABLE dbo.[ingested_messages] ADD [message_id] NVARCHAR(400) NULL;
IF COL_LENGTH(N'dbo.[ingested_messages]', N'source') IS NULL ALTER TABLE dbo.[ingested_messages] ADD [source] NVARCHAR(20) NULL;
IF COL_LENGTH(N'dbo.[ingested_messages]', N'offers_found') IS NULL ALTER TABLE dbo.[ingested_messages] ADD [offers_found] INT NULL;
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = N'ix_ingested_messages_message_id') CREATE INDEX ix_ingested_messages_message_id ON dbo.[ingested_messages] ([message_id]);
GO

