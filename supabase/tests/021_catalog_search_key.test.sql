-- catalog.normalize_text() and catalog.search_key(): PRD §7 normalization of search_text.
-- Lowercase, unaccented, whitespace collapsed, leading "the" removed (title and credit separately).
begin;
select plan(20);

select volatility_is('catalog', 'normalize_text', array['text'], 'immutable', 'normalize_text is immutable (needed for a generated column)');
select volatility_is('catalog', 'search_key', array['text', 'text'], 'immutable', 'search_key is immutable (needed for a generated column)');

-- normalize_text
select is(catalog.normalize_text('OK Computer'), 'ok computer', 'lowercases');
select is(catalog.normalize_text('Homogénic'), 'homogenic', 'removes accents');
select is(catalog.normalize_text('Sigur Rós – Ágætis byrjun'), 'sigur ros - agaetis byrjun', 'removes accents, expands æ, and turns typographic dashes into hyphens');
select is(catalog.normalize_text('Motörhead'), 'motorhead', 'removes umlauts');
select is(catalog.normalize_text(E'  Kid \t A\n '), 'kid a', 'trims and collapses spaces, tabs and newlines');
select is(catalog.normalize_text('The Velvet Underground'), 'velvet underground', 'removes a leading "the"');
select is(catalog.normalize_text('THE Cure'), 'cure', 'removes a leading "the" in any case');
select is(catalog.normalize_text('   The Smiths'), 'smiths', 'removes a leading "the" after leading spaces');
select is(catalog.normalize_text('Theatre Is Evil'), 'theatre is evil', 'keeps "the" at the start of a longer word');
select is(catalog.normalize_text('The-Dream'), 'the-dream', 'keeps "the" joined by punctuation');
select is(catalog.normalize_text('Meet the Beatles'), 'meet the beatles', 'keeps "the" in the middle');
select is(catalog.normalize_text('The'), 'the', 'keeps a lone "the"');
select is(catalog.normalize_text('The The'), 'the', 'removes only the first "the"');
select is(catalog.normalize_text(null), '', 'NULL becomes an empty string');

-- search_key
select is(catalog.search_key('The Dark Side of the Moon', 'Pink Floyd'), 'dark side of the moon pink floyd', 'title then credit');
select is(catalog.search_key('Abbey Road', 'The Beatles'), 'abbey road beatles', 'leading "the" removed from the credit');
select is(catalog.search_key('Untitled', ''), 'untitled', 'empty credit leaves no trailing space');
select is(catalog.search_key('Watch the Throne', 'JAY-Z & Kanye West'), 'watch the throne jay-z & kanye west', 'keeps punctuation in multi-artist credits');

select * from finish();
rollback;
