-- catalog.albums: constraints, generated search_text, updated_at, retire-not-delete, and who can read/write.
begin;
select plan(33);

select has_index('catalog', 'albums', 'albums_popularity_idx', 'albums has a popularity index');
select ok(
  (select indexdef like '%USING gin (search_text%gin_trgm_ops) WHERE (NOT retired)%'
   from pg_indexes where schemaname = 'catalog' and indexname = 'albums_search_text_trgm_idx'),
  'search_text has a partial trigram GIN index that skips retired albums'
);
select col_is_unique('catalog', 'albums', 'mbid', 'album mbid is unique');
select col_default_is('catalog', 'albums', 'link_count', '0', 'link_count defaults to 0');

set local role service_role;

select lives_ok(
  $$insert into catalog.albums (mbid, title, artist_credit, primary_type, secondary_types, first_release_date, canonical_release_mbid, release_count, popularity)
    values
      ('aaaaaaaa-0000-4000-8000-000000000001', 'The Qwyxel Side of the Moon', 'Qwyxel Floyd', 'Album', '{}', '1973-03-01', 'b84ee12a-09ef-421b-82de-0441a926375b', 500, 12.5),
      ('aaaaaaaa-0000-4000-8000-000000000002', 'Qwyxel Road', 'The Qwyxel Beatles', 'Album', '{}', '1969', null, 300, 10),
      ('aaaaaaaa-0000-4000-8000-0000000000d1', 'Qwyxel Defaults', 'Someone', 'Album', default, null, null, default, default)$$,
  'service role can insert albums'
);
select ok(
  (select secondary_types = '{}' and release_count = 0 and link_count = 0 and popularity = 0 and not retired
          and tracks_loaded_at is null and updated_at is not null
   from catalog.albums where mbid = 'aaaaaaaa-0000-4000-8000-0000000000d1'),
  'defaults: no secondary types, zero counts, not retired, tracks not loaded'
);
select throws_ok(
  $$insert into catalog.albums (mbid, title, artist_credit, primary_type, link_count) values (gen_random_uuid(), 'T', 'X', 'Album', -1)$$,
  '23514', null, 'link_count cannot be negative'
);

-- Generated search_text.
select is(
  (select search_text from catalog.albums where mbid = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'qwyxel side of the moon qwyxel floyd',
  'search_text is generated from title and artist credit'
);
select throws_ok(
  $$insert into catalog.albums (mbid, title, artist_credit, primary_type, search_text) values (gen_random_uuid(), 'T', 'X', 'Album', 'forced')$$,
  '428C9', null, 'search_text cannot be set on insert'
);
select throws_ok(
  $$update catalog.albums set search_text = 'forced' where title = 'Qwyxel Road'$$,
  '428C9', null, 'search_text cannot be set on update'
);
select lives_ok(
  $$update catalog.albums set title = 'Qwyxel Road (Remaster)', artist_credit = 'Beatles' where title = 'Qwyxel Road'$$,
  'service role can update albums'
);
select is(
  (select search_text from catalog.albums where mbid = 'aaaaaaaa-0000-4000-8000-000000000002'),
  'qwyxel road (remaster) beatles',
  'search_text follows title and credit changes'
);

-- Constraints.
select throws_ok(
  $$insert into catalog.albums (mbid, title, artist_credit, primary_type) values ('aaaaaaaa-0000-4000-8000-000000000001', 'Dupe', 'X', 'Album')$$,
  '23505', null, 'album MBIDs are unique'
);
select lives_ok(
  $$insert into catalog.albums (mbid, title, artist_credit, primary_type, secondary_types) values (gen_random_uuid(), 'An EP', 'X', 'EP', '{Live}')$$,
  'EPs are allowed, with secondary types'
);
select throws_ok(
  $$insert into catalog.albums (mbid, title, artist_credit, primary_type) values (gen_random_uuid(), 'A Single', 'X', 'Single')$$,
  '23514', null, 'Single is not an allowed primary type'
);
select throws_ok(
  $$insert into catalog.albums (mbid, title, artist_credit, primary_type) values (gen_random_uuid(), 'T', 'X', null)$$,
  '23502', null, 'primary_type is required'
);
select throws_ok(
  $$insert into catalog.albums (mbid, title, artist_credit, primary_type) values (gen_random_uuid(), '  ', 'X', 'Album')$$,
  '23514', null, 'title cannot be blank'
);
select throws_ok(
  $$insert into catalog.albums (mbid, title, artist_credit, primary_type) values (gen_random_uuid(), 'T', null, 'Album')$$,
  '23502', null, 'artist_credit is required'
);
select throws_ok(
  $$insert into catalog.albums (mbid, title, artist_credit, primary_type, release_count) values (gen_random_uuid(), 'T', 'X', 'Album', -1)$$,
  '23514', null, 'release_count cannot be negative'
);
select lives_ok(
  $$insert into catalog.albums (mbid, title, artist_credit, primary_type, first_release_date) values
      (gen_random_uuid(), 'Qwyxel Year', 'X', 'Album', '1999'),
      (gen_random_uuid(), 'Qwyxel Month', 'X', 'Album', '1999-12')$$,
  'partial release dates (YYYY, YYYY-MM) are allowed'
);
select throws_ok(
  $$insert into catalog.albums (mbid, title, artist_credit, primary_type, first_release_date) values (gen_random_uuid(), 'T', 'X', 'Album', '1973-3-1')$$,
  '23514', null, 'release dates must be zero-padded'
);
select throws_ok(
  $$insert into catalog.albums (mbid, title, artist_credit, primary_type, first_release_date) values (gen_random_uuid(), 'T', 'X', 'Album', '73')$$,
  '23514', null, 'release dates need a four-digit year'
);
select results_eq(
  $$select title from catalog.albums where title in ('Qwyxel Year', 'Qwyxel Month', 'The Qwyxel Side of the Moon') order by first_release_date$$,
  $$values ('The Qwyxel Side of the Moon'), ('Qwyxel Year'), ('Qwyxel Month')$$,
  'partial dates sort chronologically as text'
);

-- updated_at and retiring.
select lives_ok(
  $$update catalog.albums set updated_at = '2000-01-01', retired = true where mbid = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  'service role can retire an album'
);
select is(
  (select updated_at from catalog.albums where mbid = 'aaaaaaaa-0000-4000-8000-000000000001'),
  now(),
  'updates set updated_at to now(), whatever value was given'
);

-- Never deleted.
select throws_ok($$delete from catalog.albums where mbid = 'aaaaaaaa-0000-4000-8000-000000000001'$$, '42501', null, 'service role cannot delete albums');
reset role;
select throws_ok(
  $$delete from catalog.albums where mbid = 'aaaaaaaa-0000-4000-8000-000000000001'$$,
  '42501', 'catalog albums rows are never deleted; set retired = true instead',
  'even the owner cannot delete albums'
);
-- Run the fixtures' deferred foreign-key checks (merged_into_id) now: Postgres refuses TRUNCATE
-- with pending trigger events before the trigger under test gets a chance to fire.
set constraints all immediate;
select throws_ok($$truncate catalog.albums cascade$$, '42501', null, 'even the owner cannot truncate albums');

-- Signed out.
set local role anon;
select set_config('request.jwt.claims', '', true);
select is(
  (select count(*)::int from catalog.albums where mbid in ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000002')),
  2,
  'anon can read albums, including retired ones'
);
select throws_ok($$insert into catalog.albums (mbid, title, artist_credit, primary_type) values (gen_random_uuid(), 'X', 'X', 'Album')$$, '42501', null, 'anon cannot insert albums');

-- Signed in.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "00000000-0000-0000-0000-00000000000a", "role": "authenticated"}', true);
select throws_ok($$update catalog.albums set retired = false$$, '42501', null, 'signed-in users cannot update albums');
select throws_ok($$delete from catalog.albums$$, '42501', null, 'signed-in users cannot delete albums');

reset role;
select ok(
  (select retired from catalog.albums where mbid = 'aaaaaaaa-0000-4000-8000-000000000001'),
  'the retired album was not changed by readers'
);

select * from finish();
rollback;
