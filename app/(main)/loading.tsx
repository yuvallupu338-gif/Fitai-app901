import { PostSkeletonList } from '@/components/feed/post-skeleton';

export default function Loading() {
  return (
    <div className="space-y-4 px-4 py-6 lg:px-0">
      <PostSkeletonList count={2} />
    </div>
  );
}
