-- Harness smoke test: proves `supabase test db` runs pgTAP against the local stack.
begin;
select plan(3);

select has_extension('pgtap', 'pgTAP is available to the test run');
select has_schema('public', 'public schema exists');
select has_schema('auth', 'Supabase auth schema exists');

select * from finish();
rollback;
