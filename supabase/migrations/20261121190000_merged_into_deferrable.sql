-- catalog.albums.merged_into_id references catalog.albums itself. A data-only restore
-- (`pnpm catalog:restore`) copies rows in no particular order, so a merged album can arrive before
-- its survivor. Check the reference at commit instead; the restore runs in one transaction.
alter table catalog.albums
  alter constraint albums_merged_into_id_fkey deferrable initially deferred;
