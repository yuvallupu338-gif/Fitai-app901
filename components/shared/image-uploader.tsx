'use client';

import * as React from 'react';
import Image from 'next/image';
import { Camera, ImagePlus, Loader2, Trash2, Video } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { uploadFile, type UploadedFile } from '@/lib/upload-client';
import type { StorageBucket } from '@/lib/constants';

type AvatarUploaderProps = {
  value: string | null;
  onChange: (url: string | null) => void;
  bucket?: StorageBucket;
  label?: string;
  shape?: 'circle' | 'cover';
  className?: string;
};

/** העלאת תמונה בודדת (תמונת פרופיל או תמונת כיסוי). */
export function SingleImageUploader({
  value,
  onChange,
  bucket = 'avatars',
  label = 'העלאת תמונה',
  shape = 'circle',
  className,
}: AvatarUploaderProps) {
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setBusy(true);
    try {
      const uploaded = await uploadFile(file, bucket);
      onChange(uploaded.url);
      toast.success('התמונה הועלתה');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'העלאת התמונה נכשלה');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn('flex items-center gap-4', className)}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className={cn(
          'relative flex shrink-0 items-center justify-center overflow-hidden border border-dashed border-border bg-muted/50 transition-colors hover:border-primary hover:bg-muted',
          shape === 'circle' ? 'size-24 rounded-full' : 'h-28 w-full rounded-2xl',
        )}
        aria-label={label}
      >
        {value ? (
          <Image src={value} alt="" fill sizes="200px" className="object-cover" />
        ) : (
          <span className="flex flex-col items-center gap-1 text-muted-foreground">
            <Camera className="size-6" aria-hidden />
            <span className="text-xs">{label}</span>
          </span>
        )}
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="size-5 animate-spin text-primary" aria-hidden />
          </span>
        ) : null}
      </button>

      <div className="flex flex-col gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={busy}>
          {value ? 'החלפת תמונה' : 'בחירת תמונה'}
        </Button>
        {value ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)} disabled={busy}>
            <Trash2 className="size-4" aria-hidden />
            הסרה
          </Button>
        ) : null}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void handleFile(file);
          event.target.value = '';
        }}
      />
    </div>
  );
}

export type MediaItem = UploadedFile & {
  beforeAfterRole?: 'before' | 'after' | null;
  altText?: string | null;
};

/** העלאת גלריה: מספר תמונות או סרטון קצר. */
export function MediaUploader({
  value,
  onChange,
  bucket = 'posts',
  max = 10,
  allowVideo = true,
  beforeAfterMode = false,
}: {
  value: MediaItem[];
  onChange: (items: MediaItem[]) => void;
  bucket?: StorageBucket;
  max?: number;
  allowVideo?: boolean;
  beforeAfterMode?: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const handleFiles = async (files: FileList) => {
    const room = max - value.length;
    if (room <= 0) {
      toast.error(`אפשר להעלות עד ${max} קבצים`);
      return;
    }

    setBusy(true);
    const uploaded: MediaItem[] = [];

    for (const file of Array.from(files).slice(0, room)) {
      try {
        const result = await uploadFile(file, bucket);
        uploaded.push({ ...result, beforeAfterRole: null, altText: null });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : `העלאת ${file.name} נכשלה`);
      }
    }

    if (uploaded.length > 0) {
      onChange([...value, ...uploaded]);
      toast.success(`הועלו ${uploaded.length} קבצים`);
    }
    setBusy(false);
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {value.map((item, index) => (
          <div key={item.path} className="group relative aspect-square overflow-hidden rounded-xl border bg-muted">
            {item.mediaType === 'video' ? (
              <video src={item.url} className="h-full w-full object-cover" muted playsInline />
            ) : (
              <Image src={item.url} alt={item.altText ?? ''} fill sizes="150px" className="object-cover" />
            )}

            <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-1">
              <div className="flex gap-0.5">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  className="rounded bg-black/40 px-1.5 text-xs text-white disabled:opacity-30"
                  aria-label="הזזה אחורה"
                >
                  ›
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  disabled={index === value.length - 1}
                  className="rounded bg-black/40 px-1.5 text-xs text-white disabled:opacity-30"
                  aria-label="הזזה קדימה"
                >
                  ‹
                </button>
              </div>
              <button
                type="button"
                onClick={() => onChange(value.filter((_, i) => i !== index))}
                className="rounded bg-black/40 p-1 text-white"
                aria-label="מחיקת הקובץ"
              >
                <Trash2 className="size-3" />
              </button>
            </div>

            {beforeAfterMode ? (
              <div className="absolute inset-x-1 top-1 flex gap-1">
                {(['before', 'after'] as const).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() =>
                      onChange(
                        value.map((m, i) =>
                          i === index ? { ...m, beforeAfterRole: m.beforeAfterRole === role ? null : role } : m,
                        ),
                      )
                    }
                    className={cn(
                      'flex-1 rounded px-1 py-0.5 text-[10px] font-medium transition-colors',
                      item.beforeAfterRole === role ? 'bg-primary text-primary-foreground' : 'bg-black/50 text-white',
                    )}
                  >
                    {role === 'before' ? 'לפני' : 'אחרי'}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}

        {value.length < max ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="flex aspect-square flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border bg-muted/40 text-muted-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {busy ? (
              <Loader2 className="size-5 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="size-5" aria-hidden />
            )}
            <span className="text-xs">הוספה</span>
          </button>
        ) : null}
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {allowVideo ? <Video className="size-3.5" aria-hidden /> : null}
        תמונות עד 8MB{allowVideo ? ', סרטונים עד 25MB' : ''}. התמונות נדחסות אוטומטית לפני ההעלאה.
      </p>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={
          allowVideo
            ? 'image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,video/quicktime'
            : 'image/jpeg,image/png,image/webp,image/avif'
        }
        className="sr-only"
        onChange={(event) => {
          if (event.target.files?.length) void handleFiles(event.target.files);
          event.target.value = '';
        }}
      />
    </div>
  );
}
