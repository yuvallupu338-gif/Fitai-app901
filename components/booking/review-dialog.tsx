'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StarRating } from '@/components/ui/star-rating';
import { MediaUploader, type MediaItem } from '@/components/shared/image-uploader';
import { submitReviewAction } from '@/lib/actions/reviews';

/** כתיבת ביקורת – זמינה רק אחרי טיפול שסומן כהושלם. */
export function ReviewDialog({
  bookingId,
  professionalName,
  serviceName,
  defaultOpen = false,
}: {
  bookingId: string;
  professionalName: string;
  serviceName: string;
  defaultOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(defaultOpen);
  const [rating, setRating] = React.useState(0);
  const [body, setBody] = React.useState('');
  const [images, setImages] = React.useState<MediaItem[]>([]);
  const [pending, setPending] = React.useState(false);

  const submit = async () => {
    if (rating === 0) {
      toast.error('יש לבחור דירוג');
      return;
    }

    setPending(true);
    const result = await submitReviewAction({
      bookingId,
      rating,
      body: body || null,
      imageUrls: images.map((image) => image.url),
    });
    setPending(false);

    if (!result.ok) {
      toast.error(result.error);
      return;
    }

    toast.success(result.message ?? 'הביקורת פורסמה');
    setOpen(false);
    router.refresh();
  };

  return (
    <>
      <Button block onClick={() => setOpen(true)}>
        <Star className="size-4" aria-hidden />
        כתיבת ביקורת על {professionalName}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>איך היה הטיפול?</DialogTitle>
            <DialogDescription>
              {serviceName ? `${serviceName} · ` : ''}
              הביקורת תופיע בפרופיל של {professionalName} עם סימון &quot;הזמנה מאומתת&quot;.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2">
              <StarRating value={rating} onChange={setRating} size="lg" />
              <p className="text-sm text-muted-foreground">
                {rating === 0
                  ? 'בחרו דירוג'
                  : ['', 'לא מרוצה', 'בסדר', 'טוב', 'טוב מאוד', 'מצוין!'][rating]}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="review-body">מה תרצו לספר?</Label>
              <Textarea
                id="review-body"
                rows={4}
                value={body}
                onChange={(event) => setBody(event.target.value)}
                maxLength={2000}
                placeholder="דייקנות, יחס, תוצאה, ניקיון…"
              />
            </div>

            <div className="space-y-1.5">
              <Label>תמונות (רשות)</Label>
              <MediaUploader
                value={images}
                onChange={setImages}
                bucket="reviews"
                max={4}
                allowVideo={false}
              />
            </div>
          </div>

          <DialogFooter>
            <Button onClick={submit} loading={pending} disabled={rating === 0}>
              פרסום הביקורת
            </Button>
            <Button variant="outline" onClick={() => setOpen(false)}>
              לא עכשיו
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
