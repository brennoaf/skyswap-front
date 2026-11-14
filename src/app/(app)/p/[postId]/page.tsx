import { Suspense } from 'react'
import { PostViewer } from '@/components/post/post-viewer'

export default async function PostPage({ params }: { params: Promise<{ postId: string }> }) {
  const { postId } = await params
  return (
    <Suspense>
      <PostViewer id={postId} />
    </Suspense>
  )
}
