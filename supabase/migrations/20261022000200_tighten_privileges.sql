-- Signed-in users never need TRUNCATE, TRIGGER or REFERENCES; remove Supabase's defaults (now and for future tables).
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;
alter default privileges for role postgres in schema public revoke truncate, trigger, references on tables from anon, authenticated;
