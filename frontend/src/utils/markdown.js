export function isMarkdownFile(name) {
  return /\.(md|markdown)$/i.test(name)
}

// Builds the path to the shared full-page markdown viewer.
// `back`/`backLabel` drive the viewer's "← Back" link.
export function markdownViewerPath({ url, name, back, backLabel }) {
  const params = new URLSearchParams({ url, name, back, backLabel })
  return `/documents/view?${params.toString()}`
}
