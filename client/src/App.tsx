import { useEffect, useState } from 'react'

type Article = {
  title: string
  link: string
  publishedAt: string
  body: string
}

type FeedDocument = {
  resourceName: string
  articles: Article[]
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

function toPreview(body: string) {
  return body.slice(0, 300)
}

function App() {
  const [document, setDocument] = useState<FeedDocument | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadArticles() {
      try {
        setLoading(true)
        setError(null)

        const response = await fetch('/api/resources/utility-dive/articles')

        if (!response.ok) {
          throw new Error('Failed to load articles')
        }

        const data: FeedDocument = await response.json()

        if (!cancelled) {
          setDocument(data)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Unknown error')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadArticles()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <main className="app-shell">
      <section className="app-panel">
        <p className="eyebrow">Energy Sector Analyst</p>
        <h1>Recent utility news</h1>
        <p className="intro">
          Articles from the last 72 hours for {document?.resourceName ?? 'Utility Dive'}.
        </p>

        {loading ? <p className="status">Loading articles...</p> : null}
        {error ? <p className="status error">{error}</p> : null}

        {!loading && !error && document ? (
          <div className="article-list">
            {document.articles.length > 0 ? (
              document.articles.map((article) => (
                <article className="article-card" key={article.link}>
                  <a
                    className="article-title"
                    href={article.link}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {article.title}
                  </a>
                  <p className="article-date">{formatDate(article.publishedAt)}</p>
                  <p className="article-preview">{toPreview(article.body)}</p>
                </article>
              ))
            ) : (
              <p className="status">No recent articles found.</p>
            )}
          </div>
        ) : null}
      </section>
    </main>
  )
}

export default App
