interface Post {
  id: string
  title: string
  date: string
  featured: boolean
  body: string
}

// Rendered only in the browser, so it gets content through its props.
export default function PostFacts({
  title,
  featured,
  post,
  posts,
}: {
  title: string
  featured: boolean
  post: Post
  posts: Post[]
}) {
  const words = post.body.split(/\s+/).filter(Boolean).length
  const position = posts.findIndex(({ id }) => id === post.id) + 1
  return (
    <aside className="post-facts">
      <p>
        {title}
        {featured && ' (featured)'}
      </p>
      <p>
        {words} words, post {position} of {posts.length}
      </p>
    </aside>
  )
}
