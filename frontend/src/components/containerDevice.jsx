// Shared bits for rendering a monitored container as a little "device":
// its status label, a role guessed from the image/name, and a matching glyph.
// Used by the Container Manager page (full cards) and the Dashboard (mini rows).

export const STATUS_LABEL = { healthy: 'Healthy', working: 'Working', down: 'Down' }

export const ROLE_LABEL = {
  broker: 'broker', cache: 'cache', database: 'database', plc: 'plc',
  gateway: 'gateway', edge: 'edge node', web: 'web', container: 'container',
}

// Guess a device class from the image/name so each unit gets a fitting glyph.
// Order matters: check the more specific families before generic words like
// "node" (edge) that appear inside other names.
export function roleFor(c) {
  const s = `${c.image || ''} ${c.name || ''}`.toLowerCase()
  if (/mosquitto|mqtt|broker|kafka|rabbit/.test(s)) return 'broker'
  if (/redis|memcache|(^|[^a-z])cache([^a-z]|$)/.test(s)) return 'cache'
  if (/postgres|timescale|historian|maria|mysql|mongo|sqlite|(^|[^a-z])db([^a-z]|$)/.test(s)) return 'database'
  if (/opcua|open62541|modbus|(^|[^a-z])plc([^a-z]|$)/.test(s)) return 'plc'
  if (/ignition|gateway|(^|[^a-z])gw([^a-z]|$)/.test(s)) return 'gateway'
  if (/busybox|(^|[^a-z])edge([^a-z]|$)|sensor|(^|[^a-z])node([^a-z]|$)/.test(s)) return 'edge'
  if (/nginx|httpd|apache|caddy|grafana|config|repo|(^|[^a-z])web([^a-z]|$)/.test(s)) return 'web'
  return 'container'
}

const GLYPHS = {
  broker: (
    <>
      <circle cx="12" cy="12" r="2" />
      <path d="M8.8 8.8a4.5 4.5 0 0 0 0 6.4M15.2 8.8a4.5 4.5 0 0 1 0 6.4M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4" />
    </>
  ),
  cache: <path d="M13 2.5 5.5 13H11l-1 8.5L18.5 10H13z" />,
  database: (
    <>
      <ellipse cx="12" cy="5.5" rx="7" ry="2.8" />
      <path d="M5 5.5v13c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8v-13" />
      <path d="M5 12c0 1.55 3.13 2.8 7 2.8s7-1.25 7-2.8" />
    </>
  ),
  plc: (
    <>
      <path d="M4 15a8 8 0 0 1 16 0" />
      <path d="M12 15l4-3" />
      <circle cx="12" cy="15" r="1" />
      <path d="M4.2 15H6M18 15h1.8M12 7v1.6" />
    </>
  ),
  gateway: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2.8M12 18.2V21M3 12h2.8M18.2 12H21M6.2 6.2l2 2M15.8 15.8l2 2M17.8 6.2l-2 2M8.2 15.8l-2 2" />
    </>
  ),
  edge: (
    <>
      <rect x="7" y="7" width="10" height="10" rx="1.2" />
      <rect x="10" y="10" width="4" height="4" rx="0.6" />
      <path d="M10 4v3M14 4v3M10 17v3M14 17v3M4 10h3M4 14h3M17 10h3M17 14h3" />
    </>
  ),
  web: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M4 12h16" />
      <path d="M12 4c2.6 2.4 2.6 13.2 0 16M12 4c-2.6 2.4-2.6 13.2 0 16" />
    </>
  ),
  container: (
    <>
      <path d="M12 2.8 3.5 7v10L12 21.2 20.5 17V7z" />
      <path d="M3.5 7 12 11.2 20.5 7" />
      <path d="M12 11.2V21.2" />
    </>
  ),
}

export function DeviceIcon({ role, size = 26 }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor"
      strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {GLYPHS[role] || GLYPHS.container}
    </svg>
  )
}
