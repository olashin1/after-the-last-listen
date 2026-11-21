-- catalog schema: structure, RLS, and the full privilege matrix.
-- Rule (CLAUDE.md): readable by everyone, writable only by the service role; artists/albums never deleted.
begin;
select plan(42);

select has_schema('catalog', 'catalog schema exists');
select tables_are(
  'catalog',
  array['artists', 'albums', 'album_artists', 'mbid_redirects', 'tracks'],
  'catalog has exactly the expected tables'
);
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'catalog' and c.relkind = 'r' and not c.relrowsecurity),
  0,
  'RLS is enabled on every catalog table'
);
select has_extension('extensions', 'unaccent', 'unaccent is installed in the extensions schema');

-- Schema usage.
select ok(has_schema_privilege('anon', 'catalog', 'usage'), 'anon can use the catalog schema');
select ok(has_schema_privilege('authenticated', 'catalog', 'usage'), 'authenticated can use the catalog schema');
select ok(has_schema_privilege('service_role', 'catalog', 'usage'), 'service_role can use the catalog schema');
select ok(not has_schema_privilege('anon', 'catalog', 'create'), 'anon cannot create objects in catalog');
select ok(not has_schema_privilege('authenticated', 'catalog', 'create'), 'authenticated cannot create objects in catalog');
select ok(not has_schema_privilege('service_role', 'catalog', 'create'), 'service_role cannot create objects in catalog');

-- Readers: SELECT only, on every table.
select table_privs_are('catalog', 'artists', 'anon', array['SELECT'], 'anon: artists select only');
select table_privs_are('catalog', 'albums', 'anon', array['SELECT'], 'anon: albums select only');
select table_privs_are('catalog', 'album_artists', 'anon', array['SELECT'], 'anon: album_artists select only');
select table_privs_are('catalog', 'mbid_redirects', 'anon', array['SELECT'], 'anon: mbid_redirects select only');
select table_privs_are('catalog', 'artists', 'authenticated', array['SELECT'], 'authenticated: artists select only');
select table_privs_are('catalog', 'albums', 'authenticated', array['SELECT'], 'authenticated: albums select only');
select table_privs_are('catalog', 'album_artists', 'authenticated', array['SELECT'], 'authenticated: album_artists select only');
select table_privs_are('catalog', 'mbid_redirects', 'authenticated', array['SELECT'], 'authenticated: mbid_redirects select only');

-- Writer: no DELETE/TRUNCATE on artists, albums or redirects; credits can be rewritten.
select table_privs_are('catalog', 'artists', 'service_role', array['SELECT', 'INSERT', 'UPDATE'], 'service_role: artists without delete');
select table_privs_are('catalog', 'albums', 'service_role', array['SELECT', 'INSERT', 'UPDATE'], 'service_role: albums without delete');
select table_privs_are('catalog', 'album_artists', 'service_role', array['SELECT', 'INSERT', 'UPDATE', 'DELETE'], 'service_role: album_artists with delete');
select table_privs_are('catalog', 'mbid_redirects', 'service_role', array['SELECT', 'INSERT', 'UPDATE'], 'service_role: mbid_redirects without delete');

-- Every table has a public select policy for anon and authenticated, and no write policies.
select policies_are('catalog', 'artists', array['Catalog artists are readable by everyone'], 'artists: only the read policy');
select policies_are('catalog', 'albums', array['Catalog albums are readable by everyone'], 'albums: only the read policy');
select policies_are('catalog', 'album_artists', array['Catalog album credits are readable by everyone'], 'album_artists: only the read policy');
select policies_are('catalog', 'mbid_redirects', array['Catalog MBID redirects are readable by everyone'], 'mbid_redirects: only the read policy');
select policy_cmd_is('catalog', 'artists', 'Catalog artists are readable by everyone', 'select', 'artists policy is select');
select policy_cmd_is('catalog', 'albums', 'Catalog albums are readable by everyone', 'select', 'albums policy is select');
select policy_cmd_is('catalog', 'album_artists', 'Catalog album credits are readable by everyone', 'select', 'album_artists policy is select');
select policy_cmd_is('catalog', 'mbid_redirects', 'Catalog MBID redirects are readable by everyone', 'select', 'mbid_redirects policy is select');
select policy_roles_are('catalog', 'albums', 'Catalog albums are readable by everyone', array['anon', 'authenticated'], 'albums policy applies to anon and authenticated');

-- Functions: normalization is callable by everyone; trigger helpers are not callable directly.
select ok(has_function_privilege('anon', 'catalog.search_key(text, text)', 'execute'), 'anon can execute search_key');
select ok(has_function_privilege('authenticated', 'catalog.normalize_text(text)', 'execute'), 'authenticated can execute normalize_text');
select ok(has_function_privilege('service_role', 'catalog.search_key(text, text)', 'execute'), 'service_role can execute search_key');
select ok(not has_function_privilege('anon', 'catalog.prevent_delete()', 'execute'), 'anon cannot execute prevent_delete');
select ok(not has_function_privilege('authenticated', 'catalog.touch_updated_at()', 'execute'), 'authenticated cannot execute touch_updated_at');

-- Triggers that enforce the rules.
select has_trigger('catalog', 'artists', 'artists_prevent_delete', 'artists block delete');
select has_trigger('catalog', 'artists', 'artists_prevent_truncate', 'artists block truncate');
select has_trigger('catalog', 'albums', 'albums_prevent_delete', 'albums block delete');
select has_trigger('catalog', 'albums', 'albums_prevent_truncate', 'albums block truncate');
select has_trigger('catalog', 'artists', 'artists_touch_updated_at', 'artists bump updated_at');
select has_trigger('catalog', 'albums', 'albums_touch_updated_at', 'albums bump updated_at');

select * from finish();
rollback;
