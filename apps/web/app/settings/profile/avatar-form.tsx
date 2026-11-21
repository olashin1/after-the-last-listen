"use client";

import { useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import {
  AVATAR_BUCKET,
  AVATAR_EXTENSIONS,
  AVATAR_MAX_BYTES,
  AVATAR_MAX_SOURCE_BYTES,
  AVATAR_PIXELS,
  AVATAR_TYPES,
} from "@/lib/avatar";
import { resizeToSquare } from "@/lib/image";
import { AVATAR_RULES, storageErrorMessage } from "@/lib/messages";
import { createClient } from "@/lib/supabase/client";
import { removeAvatar, setAvatar } from "./actions";

type Message = { error?: string; success?: string };

const buttonClass =
  "cursor-pointer rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium disabled:cursor-default disabled:opacity-60 dark:border-zinc-700";

/**
 * Upload goes straight from the browser to Storage (skips the 1 MB Server Action body limit),
 * then the setAvatar action records it through set_avatar(). The bucket and set_avatar()
 * enforce the rules; the checks here only give quicker messages.
 */
export function AvatarForm({ userId, path, name }: { userId: string; path: string | null; name: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<Message>({});
  const [pending, startTransition] = useTransition();

  function onFile(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = ""; // Allow picking the same file again.
    if (!file) return;

    if (!(AVATAR_TYPES as readonly string[]).includes(file.type)) {
      setMessage({ error: `That file type isn't supported. ${AVATAR_RULES}` });
      return;
    }
    if (file.size > AVATAR_MAX_SOURCE_BYTES) {
      setMessage({ error: "That image is too large to process. Choose one under 20 MB." });
      return;
    }

    startTransition(async () => {
      setMessage({});
      let blob: Blob;
      try {
        blob = await resizeToSquare(file, AVATAR_PIXELS);
      } catch {
        setMessage({ error: "We couldn't read that image. Try another file." });
        return;
      }
      if (blob.size > AVATAR_MAX_BYTES) {
        setMessage({ error: "That image is too large. The limit is 2 MB." });
        return;
      }

      const objectPath = `${userId}/${crypto.randomUUID()}.${AVATAR_EXTENSIONS[blob.type]}`;
      const { error: uploadError } = await createClient()
        .storage.from(AVATAR_BUCKET)
        .upload(objectPath, blob, { contentType: blob.type, cacheControl: "31536000", upsert: false });
      if (uploadError) {
        setMessage({ error: storageErrorMessage(uploadError as { code?: string }) });
        return;
      }

      const result = await setAvatar(objectPath);
      if (result.error) {
        // Not recorded, so don't leave the file behind.
        await createClient().storage.from(AVATAR_BUCKET).remove([objectPath]);
        setMessage({ error: result.error });
        return;
      }
      setMessage({ success: "Photo updated." });
    });
  }

  function onRemove() {
    startTransition(async () => {
      setMessage({});
      const result = await removeAvatar();
      setMessage(result.error ? { error: result.error } : { success: "Photo removed." });
    });
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="avatar-heading">
      <h2 id="avatar-heading" className="text-sm font-medium">Photo</h2>
      <div className="flex items-center gap-4">
        <Avatar path={path} name={name} size={80} />
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={pending} onClick={() => inputRef.current?.click()} className={buttonClass}>
              {pending ? "Working…" : path ? "Change photo" : "Upload photo"}
            </button>
            {path && (
              <button type="button" disabled={pending} onClick={onRemove} className={buttonClass}>
                Remove
              </button>
            )}
          </div>
          <span className="text-xs text-zinc-500">Optional. {AVATAR_RULES}</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={AVATAR_TYPES.join(",")}
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose a profile photo"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
      </div>
      {message.error && <p role="alert" className="text-sm text-red-600">{message.error}</p>}
      {message.success && <p role="status" className="text-sm text-green-700 dark:text-green-500">{message.success}</p>}
    </section>
  );
}
