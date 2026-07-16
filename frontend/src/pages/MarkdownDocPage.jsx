import { useState, useEffect } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import './MarkdownDocPage.css'

function MarkdownDocPage() {
  const [params] = useSearchParams()
  const url = params.get('url')
  const name = params.get('name') || 'Document'
  const back = params.get('back') || '/'
  const backLabel = params.get('backLabel') || 'Back'

  const [text, setText] = useState('')
  const [loading, setLoading] = useState(!!url)
  const [error, setError] = useState(url ? '' : 'No document specified.')

  useEffect(() => {
    if (!url) return
    let cancelled = false
    setLoading(true)
    setError('')
    fetch(url)
      .then(res => { if (!res.ok) throw new Error(); return res.text() })
      .then(body => { if (!cancelled) setText(body) })
      .catch(() => { if (!cancelled) setError('Failed to load document.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [url])

  return (
    <div className="page mdview-page">
      <Link className="mdview-back-link" to={back}>← {backLabel}</Link>
      <h1 className="mdview-title">{name}</h1>
      <div className="mdview-body">
        {loading && <p className="mdview-empty">Loading…</p>}
        {error && <p className="form-error">{error}</p>}
        {!loading && !error && (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
        )}
      </div>
    </div>
  )
}

export default MarkdownDocPage
