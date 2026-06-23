// Shared DigitalOcean API helpers.
// One source of truth for the token, the fetch wrapper, the summarizers, and the
// high-level droplet/image operations — imported by both the MCP server
// (server.js, for Claude) and backend entries (e.g. do-droplet-up, for cron/scripts).
// Uses Node's built-in fetch — no HTTP dependency.
import path from 'node:path'
import dotenv from 'dotenv'

dotenv.config({ path: path.join(import.meta.dirname, '.env') })

const API = 'https://api.digitalocean.com'

const token = () =>
  process.env.DIGITALOCEAN_API_TOKEN || process.env.DIGITALOCEAN_TOKEN || process.env.DO_API_TOKEN

// Throw a helpful error if no token is configured. Call at startup to fail fast.
export function requireToken() {
  const apiToken = token()
  if (!apiToken) {
    throw new Error(
      'digitalocean: missing DIGITALOCEAN_API_TOKEN.\n' +
        'Create a read+write token at https://cloud.digitalocean.com/account/api/tokens\n' +
        'and set DIGITALOCEAN_API_TOKEN in mcp-servers/digitalocean-mcp/.env',
    )
  }
  return apiToken
}

// Drop undefined keys so optional fields aren't sent as nulls.
export const clean = (obj) =>
  Object.fromEntries(Object.entries(obj).filter(([, value]) => value !== undefined))

// One request to the DO API. Adds auth + JSON headers, parses the body, and turns
// a non-2xx into a thrown Error carrying DigitalOcean's own message.
export async function doFetch(pathname, { method = 'GET', query, body } = {}) {
  const url = new URL(pathname, API)
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value != null) {
        url.searchParams.set(key, String(value))
      }
    }
  }
  const response = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${requireToken()}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(clean(body)) : undefined,
  })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null // DELETE / actions can return 204
  if (!response.ok) {
    const message = data?.message || data?.id || `${response.status} ${response.statusText}`
    throw new Error(`DigitalOcean API ${response.status}: ${message}`)
  }
  return data
}

// Compact view of a droplet — the full object is large and mostly noise.
export const summarize = (droplet) => ({
  id: droplet.id,
  name: droplet.name,
  status: droplet.status,
  region: droplet.region?.slug ?? null,
  size: droplet.size_slug,
  memory_mb: droplet.memory,
  vcpus: droplet.vcpus,
  disk_gb: droplet.disk,
  image: droplet.image
    ? droplet.image.slug || `${droplet.image.distribution ?? ''} ${droplet.image.name ?? ''}`.trim()
    : null,
  ipv4: (droplet.networks?.v4 ?? []).map((network) => ({
    ip: network.ip_address,
    type: network.type,
  })),
  tags: droplet.tags ?? [],
  created_at: droplet.created_at,
})

export const summarizeReservedIp = (reservedIp) => ({
  ip: reservedIp.ip,
  region: reservedIp.region?.slug ?? null,
  droplet: reservedIp.droplet ? { id: reservedIp.droplet.id, name: reservedIp.droplet.name } : null,
  locked: reservedIp.locked ?? null,
})

// --- High-level operations (used by backend entries) -----------------------

export async function listDroplets({ tag_name, per_page = 50 } = {}) {
  const data = await doFetch('/v2/droplets', { query: { tag_name, per_page } })
  return data.droplets.map(summarize)
}

export async function getDroplet(id) {
  const data = await doFetch(`/v2/droplets/${id}`)
  return summarize(data.droplet)
}

export async function createDroplet(args) {
  const data = await doFetch('/v2/droplets', { method: 'POST', body: args })
  return summarize(data.droplet)
}

export async function deleteDroplet(id) {
  await doFetch(`/v2/droplets/${id}`, { method: 'DELETE' })
  return { deleted: true, id }
}

export async function listImages(type = 'distribution') {
  const query = type === 'user' ? { private: true, per_page: 200 } : { type, per_page: 200 }
  const data = await doFetch('/v2/images', { query })
  return data.images.map((image) => ({
    slug: image.slug,
    id: image.id,
    distribution: image.distribution,
    name: image.name,
  }))
}

// Newest Ubuntu image slug (highest version number, LTS or not).
// Falls back to a known-good LTS if the list can't be parsed.
export async function latestUbuntuImage() {
  const images = await listImages('distribution')
  const ranked = images
    .map((image) => {
      const match = (image.slug || '').match(/^ubuntu-(\d+)-(\d+)-x64$/)
      return match ? { slug: image.slug, version: Number(match[1]) * 100 + Number(match[2]) } : null
    })
    .filter(Boolean)
    .sort((first, second) => second.version - first.version)
  return ranked[0]?.slug || 'ubuntu-24-04-x64'
}
