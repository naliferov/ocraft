#!/usr/bin/env node
// Thin MCP server for CRUD on DigitalOcean droplets via the API v2.
//   Create:  do_create_droplet
//   Read:    do_list_droplets, do_get_droplet
//   Update:  do_droplet_action (power/rename/resize/backups/snapshot…)
//   Delete:  do_delete_droplet
// Plus helper reads to pick valid slugs for create: do_list_sizes,
// do_list_regions, do_list_images.
// Reserved IPs (static, movable addresses — point DNS once, then reassign between
// droplets): do_list_reserved_ips, do_create_reserved_ip, do_assign_reserved_ip,
// do_unassign_reserved_ip, do_delete_reserved_ip.
//
// Auth: a DigitalOcean personal access token with read+write scope. Create one at
// https://cloud.digitalocean.com/account/api/tokens and set it in
// digitalocean-mcp/.env as DIGITALOCEAN_API_TOKEN (DIGITALOCEAN_TOKEN /
// DO_API_TOKEN also accepted). Uses Node's built-in fetch — no HTTP dependency.
import { z } from 'zod'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { doFetch, summarize, summarizeReservedIp, requireToken } from './do-api.js'

// MCP response shapers. All API logic lives in do-api.js (shared with backend entries).
const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] })
const fail = (msg) => ({ isError: true, content: [{ type: 'text', text: String(msg) }] })

const server = new McpServer({ name: 'digitalocean', version: '1.0.0' })

// --- Read ------------------------------------------------------------------

server.registerTool(
  'do_list_droplets',
  {
    title: 'List droplets',
    description:
      'List droplets on the account (compact summaries: id, name, status, region, size, IPs, tags). Optionally filter by tag. Use the id with the get/action/delete tools.',
    inputSchema: {
      tag_name: z.string().optional().describe('Only return droplets carrying this tag'),
      per_page: z
        .number()
        .int()
        .min(1)
        .max(200)
        .default(50)
        .describe('Max droplets to return (DO max 200)'),
    },
  },
  async ({ tag_name, per_page }) => {
    try {
      const data = await doFetch('/v2/droplets', { query: { tag_name, per_page } })
      return ok({
        total: data.meta?.total ?? data.droplets.length,
        droplets: data.droplets.map(summarize),
      })
    } catch (error) {
      return fail(error?.message ?? error)
    }
  },
)

server.registerTool(
  'do_get_droplet',
  {
    title: 'Get one droplet',
    description: 'Fetch a single droplet by id (compact summary).',
    inputSchema: { id: z.number().int().describe('Droplet id (from do_list_droplets)') },
  },
  async ({ id }) => {
    try {
      const data = await doFetch(`/v2/droplets/${id}`)
      return ok(summarize(data.droplet))
    } catch (error) {
      return fail(error?.message ?? error)
    }
  },
)

// --- Create ----------------------------------------------------------------

server.registerTool(
  'do_create_droplet',
  {
    title: 'Create a droplet',
    description:
      'Create (provision) a new droplet. region/size/image are slugs — use do_list_regions, do_list_sizes, do_list_images to find valid values. This starts billing immediately.',
    inputSchema: {
      name: z.string().min(1).describe('Hostname for the droplet'),
      region: z.string().min(1).describe('Region slug, e.g. "fra1", "nyc3" (see do_list_regions)'),
      size: z.string().min(1).describe('Size slug, e.g. "s-1vcpu-1gb" (see do_list_sizes)'),
      image: z
        .union([z.string(), z.number()])
        .describe('Image slug or id, e.g. "ubuntu-24-04-x64" (see do_list_images)'),
      ssh_keys: z
        .array(z.union([z.string(), z.number()]))
        .optional()
        .describe(
          'SSH key ids or fingerprints to inject (without one you can only access via console/password)',
        ),
      backups: z.boolean().optional().describe('Enable automated backups'),
      ipv6: z.boolean().optional().describe('Enable IPv6'),
      tags: z.array(z.string()).optional().describe('Tags to apply'),
      user_data: z.string().optional().describe('Cloud-init user data script'),
      vpc_uuid: z
        .string()
        .optional()
        .describe('VPC to place the droplet in (defaults to the region default VPC)'),
    },
  },
  async (args) => {
    try {
      const data = await doFetch('/v2/droplets', { method: 'POST', body: args })
      return ok({ created: true, droplet: summarize(data.droplet) })
    } catch (error) {
      return fail(error?.message ?? error)
    }
  },
)

// --- Update (droplet actions) ----------------------------------------------

server.registerTool(
  'do_droplet_action',
  {
    title: 'Act on a droplet',
    description:
      'Run a droplet action: power_on, power_off, power_cycle, shutdown, reboot, rename (needs name), resize (needs size; set disk:true for a permanent disk resize), enable_backups, disable_backups, enable_ipv6, snapshot (needs name). Returns the action record (status is usually "in-progress").',
    inputSchema: {
      id: z.number().int().describe('Droplet id'),
      action: z
        .enum([
          'power_on',
          'power_off',
          'power_cycle',
          'shutdown',
          'reboot',
          'rename',
          'resize',
          'enable_backups',
          'disable_backups',
          'enable_ipv6',
          'snapshot',
        ])
        .describe('Action type'),
      name: z.string().optional().describe('New name (rename) or snapshot name (snapshot)'),
      size: z.string().optional().describe('Target size slug (resize)'),
      disk: z
        .boolean()
        .optional()
        .describe(
          'resize only: true = permanent disk+CPU+RAM resize; false/omitted = CPU+RAM only (reversible)',
        ),
    },
  },
  async ({ id, action, name, size, disk }) => {
    try {
      if ((action === 'rename' || action === 'snapshot') && !name)
        return fail(`action "${action}" requires "name"`)
      if (action === 'resize' && !size) return fail('action "resize" requires "size"')
      const body = { type: action }
      if (action === 'rename' || action === 'snapshot') body.name = name
      if (action === 'resize') {
        body.size = size
        if (disk != null) body.disk = disk
      }
      const data = await doFetch(`/v2/droplets/${id}/actions`, { method: 'POST', body })
      return ok({ action: data.action })
    } catch (error) {
      return fail(error?.message ?? error)
    }
  },
)

// --- Delete ----------------------------------------------------------------

server.registerTool(
  'do_delete_droplet',
  {
    title: 'Delete a droplet',
    description:
      'Permanently destroy a droplet by id. IRREVERSIBLE — the droplet and its data are gone and billing stops. There is no trash/undo.',
    inputSchema: { id: z.number().int().describe('Droplet id (from do_list_droplets)') },
  },
  async ({ id }) => {
    try {
      await doFetch(`/v2/droplets/${id}`, { method: 'DELETE' })
      return ok({ deleted: true, id })
    } catch (error) {
      return fail(error?.message ?? error)
    }
  },
)

// --- Helpers for create (valid slugs) --------------------------------------

server.registerTool(
  'do_list_sizes',
  {
    title: 'List droplet sizes',
    description:
      'List available droplet size slugs with vCPUs, memory, disk, and monthly price. Use a slug for do_create_droplet "size".',
    inputSchema: {},
  },
  async () => {
    try {
      const data = await doFetch('/v2/sizes', { query: { per_page: 200 } })
      return ok(
        data.sizes.map((size) => ({
          slug: size.slug,
          vcpus: size.vcpus,
          memory_mb: size.memory,
          disk_gb: size.disk,
          price_monthly: size.price_monthly,
          available: size.available,
        })),
      )
    } catch (error) {
      return fail(error?.message ?? error)
    }
  },
)

server.registerTool(
  'do_list_regions',
  {
    title: 'List regions',
    description:
      'List region slugs (e.g. fra1, nyc3, ams3) with availability. Use a slug for do_create_droplet "region".',
    inputSchema: {},
  },
  async () => {
    try {
      const data = await doFetch('/v2/regions', { query: { per_page: 200 } })
      return ok(
        data.regions.map((region) => ({
          slug: region.slug,
          name: region.name,
          available: region.available,
        })),
      )
    } catch (error) {
      return fail(error?.message ?? error)
    }
  },
)

server.registerTool(
  'do_list_images',
  {
    title: 'List images',
    description:
      'List images to use as do_create_droplet "image". Defaults to OS distributions (Ubuntu, Debian…); pass type:"application" for one-click apps, or type:"user" for your snapshots.',
    inputSchema: {
      type: z
        .enum(['distribution', 'application', 'user'])
        .default('distribution')
        .describe('Which image set to list'),
    },
  },
  async ({ type }) => {
    try {
      const query = type === 'user' ? { private: true, per_page: 200 } : { type, per_page: 200 }
      const data = await doFetch('/v2/images', { query })
      return ok(
        data.images.map((image) => ({
          slug: image.slug,
          id: image.id,
          distribution: image.distribution,
          name: image.name,
        })),
      )
    } catch (error) {
      return fail(error?.message ?? error)
    }
  },
)

// --- Reserved IPs (stable, movable addresses) ------------------------------

server.registerTool(
  'do_list_reserved_ips',
  {
    title: 'List reserved IPs',
    description:
      'List reserved (static, movable) IPs and which droplet each is currently assigned to. A reserved IP stays constant while you reassign it between droplets — so you point DNS at it once.',
    inputSchema: {},
  },
  async () => {
    try {
      const data = await doFetch('/v2/reserved_ips', { query: { per_page: 200 } })
      return ok(data.reserved_ips.map(summarizeReservedIp))
    } catch (error) {
      return fail(error?.message ?? error)
    }
  },
)

server.registerTool(
  'do_create_reserved_ip',
  {
    title: 'Create a reserved IP',
    description:
      'Reserve a new static IP. Pass droplet_id to create it already assigned to that droplet, OR region to reserve it free for later assignment. Provide exactly one.',
    inputSchema: {
      droplet_id: z
        .number()
        .int()
        .optional()
        .describe('Assign the new reserved IP to this droplet immediately'),
      region: z
        .string()
        .optional()
        .describe('Region slug to reserve the IP in, unassigned (e.g. "fra1")'),
    },
  },
  async ({ droplet_id, region }) => {
    try {
      if (!droplet_id && !region) return fail('provide either droplet_id or region')
      if (droplet_id && region) return fail('provide only one of droplet_id or region')
      const data = await doFetch('/v2/reserved_ips', {
        method: 'POST',
        body: { droplet_id, region },
      })
      return ok({ created: true, reserved_ip: summarizeReservedIp(data.reserved_ip) })
    } catch (error) {
      return fail(error?.message ?? error)
    }
  },
)

server.registerTool(
  'do_assign_reserved_ip',
  {
    title: 'Assign / move a reserved IP',
    description:
      'Point a reserved IP at a droplet — this is the "switch to another droplet" operation. Reassigning to a different droplet_id moves the IP there in a few seconds with no DNS change.',
    inputSchema: {
      ip: z.string().describe('The reserved IP address (from do_list_reserved_ips)'),
      droplet_id: z.number().int().describe('Droplet to point the IP at'),
    },
  },
  async ({ ip, droplet_id }) => {
    try {
      const data = await doFetch(`/v2/reserved_ips/${ip}/actions`, {
        method: 'POST',
        body: { type: 'assign', droplet_id },
      })
      return ok({ action: data.action })
    } catch (error) {
      return fail(error?.message ?? error)
    }
  },
)

server.registerTool(
  'do_unassign_reserved_ip',
  {
    title: 'Unassign a reserved IP',
    description:
      'Detach a reserved IP from its droplet. It stays reserved on your account (still billable while unassigned), just not pointing at anything.',
    inputSchema: { ip: z.string().describe('The reserved IP address') },
  },
  async ({ ip }) => {
    try {
      const data = await doFetch(`/v2/reserved_ips/${ip}/actions`, {
        method: 'POST',
        body: { type: 'unassign' },
      })
      return ok({ action: data.action })
    } catch (error) {
      return fail(error?.message ?? error)
    }
  },
)

server.registerTool(
  'do_delete_reserved_ip',
  {
    title: 'Release a reserved IP',
    description:
      'Permanently release a reserved IP back to DigitalOcean. IRREVERSIBLE — you lose that address, and anything pointing DNS at it breaks.',
    inputSchema: { ip: z.string().describe('The reserved IP address') },
  },
  async ({ ip }) => {
    try {
      await doFetch(`/v2/reserved_ips/${ip}`, { method: 'DELETE' })
      return ok({ released: true, ip })
    } catch (error) {
      return fail(error?.message ?? error)
    }
  },
)

async function main() {
  requireToken() // fail fast with a helpful message if the token is missing
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('digitalocean-mcp: connected and ready.')
}

main().catch((error) => {
  console.error('digitalocean-mcp fatal:', error?.message ?? error)
  process.exit(1)
})
