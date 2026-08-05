'use client';

import type { StorageBucket } from '@/lib/constants';

export type UploadedFile = {
  url: string;
  path: string;
  bucket: string;
  mediaType: 'image' | 'video';
  width?: number;
  height?: number;
};

const MAX_DIMENSION = 1920;
const JPEG_QUALITY = 0.86;

/**
 * דוחס תמונה בדפדפן לפני ההעלאה.
 * חוסך רוחב פס, מקצר את זמן ההעלאה בסלולר ומקטין את נפח האחסון.
 */
export async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/avif') return file;
  if (file.size < 200 * 1024) return file;

  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));

    if (scale === 1 && file.size < 1.5 * 1024 * 1024) {
      bitmap.close();
      return file;
    }

    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');
    if (!context) {
      bitmap.close();
      return file;
    }

    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY),
    );

    if (!blob || blob.size >= file.size) return file;

    return new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/** מודד את מידות התמונה כדי לשמור יחס גובה־רוחב נכון בגלריה. */
export async function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith('image/')) return null;
  try {
    const bitmap = await createImageBitmap(file);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return null;
  }
}

/** מעלה קובץ דרך ‎/api/upload‎ (השרת מבצע את כל הבדיקות). */
export async function uploadFile(file: File, bucket: StorageBucket): Promise<UploadedFile> {
  const prepared = file.type.startsWith('image/') ? await compressImage(file) : file;
  const dimensions = await readImageDimensions(prepared);

  const formData = new FormData();
  formData.append('file', prepared);
  formData.append('bucket', bucket);

  const response = await fetch('/api/upload', { method: 'POST', body: formData });
  const payload = (await response.json()) as { error?: string } & UploadedFile;

  if (!response.ok) {
    throw new Error(payload.error ?? 'העלאת הקובץ נכשלה');
  }

  return { ...payload, width: dimensions?.width, height: dimensions?.height };
}
