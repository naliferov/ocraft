#!/usr/bin/env node
// Thin MCP server over Google Calendar (read-only) via the Google Calendar API.
// List calendars, list/search/get events, and query free/busy windows.
// Auth: service account. Set GOOGLE_APPLICATION_CREDENTIALS (path to the JSON key)
// and GOOGLE_CALENDAR_ID in .env, and share the target calendar with the
// service account email ("See all event details" for read access).
import path from 'node:path'
import dotenv from 'dotenv'
dotenv.config({ path: path.join(import.meta.dirname, '.env') })
import { z } from 'zod'
import { google } from 'googleapis'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const keyFile = process.env.GOOGLE_APPLICATION_CREDENTIALS

if (!keyFile) {
  // stderr only — stdout is the MCP stdio channel and must stay clean.
  console.error(
    'gcal-mcp: missing GOOGLE_APPLICATION_CREDENTIALS (path to the service-account JSON key).\n' +
      'Set it in gcal-mcp/.env, and share the target calendar with the service account email.',
  )
  process.exit(1)
}

// Service-account auth. googleapis mints/refreshes short-lived access tokens from
// the key on demand. The calendar(s) must be shared with the service account email.
const auth = new google.auth.GoogleAuth({
  keyFile,
  scopes: ['https://www.googleapis.com/auth/calendar.readonly'],
})
const calendar = google.calendar({ version: 'v3', auth })

// A service account's own "primary" calendar is empty, so default to the
// configured user calendar instead of "primary".
const DEFAULT_CAL = process.env.GOOGLE_CALENDAR_ID || 'primary'

const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] })
const fail = (msg) => ({ isError: true, content: [{ type: 'text', text: String(msg) }] })

// Normalize a Calendar API event into a compact shape.
const formatEvent = (event) => ({
  id: event.id,
  status: event.status,
  summary: event.summary ?? null,
  description: event.description ?? null,
  location: event.location ?? null,
  start: event.start?.dateTime ?? event.start?.date ?? null, // dateTime for timed events, date for all-day
  end: event.end?.dateTime ?? event.end?.date ?? null,
  allDay: !!event.start?.date,
  organizer: event.organizer?.email ?? null,
  attendees: (event.attendees ?? []).map((attendee) => ({
    email: attendee.email,
    response: attendee.responseStatus,
  })),
  hangoutLink: event.hangoutLink ?? null,
  htmlLink: event.htmlLink ?? null,
  recurringEventId: event.recurringEventId ?? null,
})

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

const server = new McpServer({ name: 'gcal', version: '1.0.0' })

server.registerTool(
  'gcal_list_calendars',
  {
    title: 'List Google calendars',
    description:
      'List the calendars in your account (id, summary, whether primary, access role, time zone). Use a calendar id with the event tools; the default everywhere is your primary calendar.',
    inputSchema: {},
  },
  async () => {
    try {
      const res = await calendar.calendarList.list()
      return ok(
        (res.data.items ?? []).map((calendarEntry) => ({
          id: calendarEntry.id,
          summary: calendarEntry.summary,
          primary: !!calendarEntry.primary,
          accessRole: calendarEntry.accessRole,
          timeZone: calendarEntry.timeZone,
        })),
      )
    } catch (error) {
      return fail(error?.message ?? error)
    }
  },
)

server.registerTool(
  'gcal_list_events',
  {
    title: 'List calendar events',
    description:
      'List events within a time window (defaults to the next 7 days). Recurring events are expanded into individual instances, ordered by start time.',
    inputSchema: {
      calendarId: z
        .string()
        .default(DEFAULT_CAL)
        .describe('Calendar id (default: configured GOOGLE_CALENDAR_ID). See gcal_list_calendars.'),
      timeMin: z.string().optional().describe('ISO start of window (default: now)'),
      timeMax: z.string().optional().describe('ISO end of window (default: now + 7 days)'),
      maxResults: z.number().int().min(1).max(2500).default(50).describe('Max events to return'),
    },
  },
  async ({ calendarId, timeMin, timeMax, maxResults }) => {
    try {
      const now = new Date()
      const min = timeMin ?? now.toISOString()
      const max = timeMax ?? new Date(now.getTime() + WEEK_MS).toISOString()
      const res = await calendar.events.list({
        calendarId,
        timeMin: min,
        timeMax: max,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults,
      })
      return ok((res.data.items ?? []).map(formatEvent))
    } catch (error) {
      return fail(error?.message ?? error)
    }
  },
)

server.registerTool(
  'gcal_search_events',
  {
    title: 'Search calendar events',
    description:
      'Full-text search across events (matches summary, description, location, attendees). Optionally bounded by a time window.',
    inputSchema: {
      query: z.string().min(1).describe('Text to search for'),
      calendarId: z
        .string()
        .default(DEFAULT_CAL)
        .describe('Calendar id (default: configured GOOGLE_CALENDAR_ID)'),
      timeMin: z.string().optional().describe('ISO start of window (optional)'),
      timeMax: z.string().optional().describe('ISO end of window (optional)'),
      maxResults: z.number().int().min(1).max(2500).default(30).describe('Max results'),
    },
  },
  async ({ query, calendarId, timeMin, timeMax, maxResults }) => {
    try {
      const res = await calendar.events.list({
        calendarId,
        q: query,
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: 'startTime',
        maxResults,
      })
      return ok((res.data.items ?? []).map(formatEvent))
    } catch (error) {
      return fail(error?.message ?? error)
    }
  },
)

server.registerTool(
  'gcal_get_event',
  {
    title: 'Get one calendar event',
    description: 'Fetch a single event by id from a calendar.',
    inputSchema: {
      eventId: z.string().min(1).describe('Event id (from gcal_list_events / gcal_search_events)'),
      calendarId: z
        .string()
        .default(DEFAULT_CAL)
        .describe('Calendar id (default: configured GOOGLE_CALENDAR_ID)'),
    },
  },
  async ({ eventId, calendarId }) => {
    try {
      const res = await calendar.events.get({ calendarId, eventId })
      return ok(formatEvent(res.data))
    } catch (error) {
      return fail(error?.message ?? error)
    }
  },
)

server.registerTool(
  'gcal_freebusy',
  {
    title: 'Query free/busy',
    description:
      'Return busy time blocks for one or more calendars within a window — useful for finding free slots.',
    inputSchema: {
      timeMin: z.string().describe('ISO start of window'),
      timeMax: z.string().describe('ISO end of window'),
      calendarIds: z
        .array(z.string())
        .default([DEFAULT_CAL])
        .describe('Calendar ids to check (default: configured GOOGLE_CALENDAR_ID)'),
    },
  },
  async ({ timeMin, timeMax, calendarIds }) => {
    try {
      const res = await calendar.freebusy.query({
        requestBody: { timeMin, timeMax, items: calendarIds.map((id) => ({ id })) },
      })
      const cals = res.data.calendars ?? {}
      return ok(
        Object.fromEntries(Object.entries(cals).map(([id, busyInfo]) => [id, busyInfo.busy ?? []])),
      )
    } catch (error) {
      return fail(error?.message ?? error)
    }
  },
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('gcal-mcp: connected and ready.')
}

main().catch((error) => {
  console.error('gcal-mcp fatal:', error?.message ?? error)
  process.exit(1)
})
