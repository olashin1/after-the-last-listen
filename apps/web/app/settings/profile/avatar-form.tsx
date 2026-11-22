"use client";

import { useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/avatar";
import { FormMessage, type FormState } from "@/components/form";
import { AVATAR_BUCKET, AVATAR_EXTENSIONS, AVATAR_MAX_SOURCE_BYTES, AVATAR_PIXELS, AVATAR_TYPES } from "@/lib/avatar";
import { resizeToSquare } from "@/lib/image";
import { AVATAR_RULES, storageErrorMessage } from "@/lib/messages";
import { createClient } from "@/lib/supabase/client";
import { removeAvatar, setAvatar } from "./actions";

const buttonClass =
  "cursor-pointer rounded-md border border-plum-300 px-3 py-1.5 text-sm font-medium disabled:cursor-default disabled:opacity-60 dark:border-plum-700";

/**
 * Upload goes straight from the browser to Storage (skips the 1 MB Server Action body limit),
 * then the setAvatar action records it through set_avatar(). The bucket (2 MB, JPEG/PNG/WebP)
 * and set_avatar() enforce the rules; the checks here only give quicker messages.
 */
export function AvatarForm({ userId, path, name }: { userId: string; path: string | null; name: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<FormState>();
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
      setMessage(undefined);
      let blob: Blob;
      try {
        // A 512px WebP/JPEG is far below the bucket's 2 MB limit, so no size check after this.
        blob = await resizeToSquare(file, AVATAR_PIXELS);
      } catch {
        setMessage({ error: "We couldn't read that image. Try another file." });
        return;
      }

      const storage = createClient().storage.from(AVATAR_BUCKET);
      const objectPath = `${userId}/${crypto.randomUUID()}.${AVATAR_EXTENSIONS[blob.type]}`;
      const { error: uploadError } = await storage.upload(objectPath, blob, {
        contentType: blob.type,
        cacheControl: "31536000",
        upsert: false,
      });
      if (uploadError) {
        setMessage({ error: storageErrorMessage(uploadError as { code?: string }) });
        return;
      }

      const result = await setAvatar(objectPath);
      if (result.error) {
        await storage.remove([objectPath]); // Not recorded, so don't leave the file behind.
        setMessage({ error: result.error });
        return;
      }
      setMessage({ success: "Photo updated." });
    });
  }

  function onRemove() {
    startTransition(async () => {
      setMessage(undefined);
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
          <span className="text-xs text-plum-500">Optional. {AVATAR_RULES}</span>
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
      <FormMessage state={message} />
    </section>
  );
}
