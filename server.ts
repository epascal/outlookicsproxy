// server.ts
// Express proxy that fetches an Outlook 365 ICS feed and fixes timezones for Google Calendar.
// - Converts UTC timestamps (..Z) to target TZ with TZID (no trailing Z)
// - Attaches TZID to floating times (no Z and no TZID) without shifting the clock
// - Leaves all-day events (VALUE=DATE) as-is
// - Optionally overrides existing TZIDs if you pass `override=1`
//
// Usage
// 1) npm init -y && npm i express luxon && npm i -D typescript ts-node @types/express
// 2) npx tsc --init  (target ES2020 or above)
// 3) Set env: SOURCE_ICS_URL, TARGET_TZ=Europe/Zurich (default), PORT=3000
// 4) npx ts-node server.ts
// 5) Open: http://localhost:3000/calendar.ics (or /calendar.ics?url=...&tz=Europe/Zurich)
//
// Notes
// - Always adds VTIMEZONE blocks for Google Calendar compatibility
// - Converts Windows timezone identifiers to IANA equivalents

import express, { type Request, type Response } from "express";
import cors from "cors";
import { DateTime } from "luxon";

const app = express();

// Enable CORS for all origins
app.use(cors({
  origin: true, // Allow all origins
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Strict env handling
const DEFAULT_URL: string | undefined = process.env.SOURCE_ICS_URL;
const DEFAULT_TZ: string = process.env.TARGET_TZ ?? "Europe/Zurich";

// Minimal validator for IANA tz name (not exhaustive but avoids obvious errors)
function isLikelyIana(name: unknown): name is string {
  if (typeof name !== "string") return false;
  return /\w+\/[-_A-Za-z0-9+]+/.test(name);
}

// Mapping Windows timezone identifiers to IANA equivalents (Switzerland-focused)
function mapWindowsToIana(windowsTz: string): string {
  const mapping: Record<string, string> = {
    // Western Europe (Switzerland, France, etc.)
    "W. Europe Standard Time": "Europe/Zurich",
    "Romance Standard Time": "Europe/Zurich", 
    "Central Europe Standard Time": "Europe/Zurich",
    "Central European Standard Time": "Europe/Zurich",
    
    // Other common European mappings
    "GMT Standard Time": "Europe/London",
    "E. Europe Standard Time": "Europe/Bucharest",
    "Russian Standard Time": "Europe/Moscow",
    
    // US mappings (if needed)
    "Eastern Standard Time": "America/New_York",
    "Central Standard Time": "America/Chicago",
    "Mountain Standard Time": "America/Denver",
    "Pacific Standard Time": "America/Los_Angeles",
  };
  
  return mapping[windowsTz] || windowsTz; // Return original if no mapping found
}

// --- ICS helpers -----------------------------------------------------------

// Unfold folded ICS lines (RFC5545: a CRLF followed by a single whitespace means continuation)
function unfoldICSLines(raw: string): string[] {
  const lines = raw.replace(/\r\n/g, "\n").split("\n");
  const unfolded: string[] = [];
  for (const line of lines) {
    if (line.startsWith(" ") || line.startsWith("\t")) {
      // continuation of previous line
      const prev = unfolded.pop();
      if (typeof prev === "string") {
        unfolded.push(prev + line.slice(1));
      } else {
        // If there's no previous line, push as-is (shouldn't happen)
        unfolded.push(line.trimStart());
      }
    } else {
      unfolded.push(line);
    }
  }
  return unfolded;
}

// Fold long lines at 75 octets per RFC5545 (we do a simple 75-char fold; safe for ASCII ICS)
function foldICSLines(lines: string[]): string {
  const folded: string[] = [];
  for (const line of lines) {
    if (line.length <= 75) {
      folded.push(line);
    } else {
      let idx = 0;
      while (idx < line.length) {
        const chunk = line.slice(idx, idx + 75);
        if (idx === 0) folded.push(chunk);
        else folded.push(" " + chunk); // continuation begins with one space
        idx += 75;
      }
    }
  }
  return folded.join("\r\n");
}

// Add a complete VTIMEZONE block compatible with Google Calendar format
function vtimezoneBlock(tzid: string): string[] {
  return [
    "BEGIN:VTIMEZONE",
    `TZID:${tzid}`,
    `X-LIC-LOCATION:${tzid}`,
    "BEGIN:DAYLIGHT",
    "TZOFFSETFROM:+0100",
    "TZOFFSETTO:+0200",
    "TZNAME:GMT+2",
    "DTSTART:19700329T020000",
    "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "TZOFFSETFROM:+0200",
    "TZOFFSETTO:+0100",
    "TZNAME:GMT+1",
    "DTSTART:19701025T030000",
    "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU",
    "END:STANDARD",
    "END:VTIMEZONE",
  ];
}

// Transform DTSTART/DTEND lines
// Rules:
// - If ends with Z -> interpret as UTC, convert to target tz, output with TZID=tz and without the trailing Z
// - If has VALUE=DATE -> leave unchanged (all-day)
// - If has TZID already -> if override=true, convert from that TZ to target TZ, else leave as-is
// - If floating (no Z, no TZID) -> attach TZID=tz without shifting

interface TransformOptions {
  targetTz: string;
  overrideExistingTz: boolean;
}

function isAllDay(line: string): boolean {
  return /^(DTSTART|DTEND|RECURRENCE-ID|EXDATE);[^:]*VALUE=DATE:/i.test(line);
}

function extractExistingTzid(params: string | undefined): string | undefined {
  if (typeof params !== "string") return undefined;
  const m = params.match(/TZID=([^;:]+)/i);
  return m?.[1];
}

function transformDateTimeLine(line: string, opts: TransformOptions): string {
  // Match property, optional params, and value
  const m = line.match(/^(DTSTART|DTEND|RECURRENCE-ID|EXDATE)(;[^:]+)?:([^\r\n]+)$/i);
  if (m === null) return line;

  const prop = m[1];
  const params = typeof m[2] === "string" ? m[2] : undefined; // includes leading ';'
  const value = m[3];

  if (isAllDay(line)) return line; // keep all-day intact

  const hasZ = value?.endsWith("Z") ?? false;
  const existingTz = extractExistingTzid(params);

  // DATE-TIME formats are either YYYYMMDDTHHMMSS(Z?) or YYYYMMDDTHHMM(Z?)
  const dtBasic = value?.replace("Z", "") ?? "";
  const hasSeconds = /T\d{6}$/.test(dtBasic);
  const fmt = hasSeconds ? "yyyyLLdd'T'HHmmss" : "yyyyLLdd'T'HHmm";

  // Helper to rebuild params string
  const buildParams = (p: string | undefined, inject: string): string => {
    const base = typeof p === "string" ? p.replace(/^;/, "") : ""; // drop leading ';'
    const parts = base.length > 0 ? base.split(";") : [];
    // Remove existing TZID if any
    const filtered = parts.filter((kv) => !kv.toUpperCase().startsWith("TZID="));
    return ";" + [inject, ...filtered].join(";");
  };

  // 1) UTC -> convert to target tz (Google Calendar style: local time with TZID)
  if (hasZ) {
    const dtUtc = DateTime.fromFormat(dtBasic, fmt, { zone: "utc" });
    if (!dtUtc.isValid) return line; // don't risk corrupting
    const local = dtUtc.setZone(opts.targetTz);
    const localStr = local.toFormat(hasSeconds ? "yyyyLLdd'T'HHmmss" : "yyyyLLdd'T'HHmm");
    const newParams = buildParams(params, `TZID=${opts.targetTz}`);
    return `${prop}${newParams}:${localStr}`;
  }

  // 2) Has existing TZID
  if (typeof existingTz === "string" && existingTz.length > 0) {
    if (!opts.overrideExistingTz) return line; // respect
    // Map Windows timezone to IANA equivalent, then convert to target timezone
    const mappedTz = mapWindowsToIana(existingTz);
    const fromZone = isLikelyIana(mappedTz) ? mappedTz : "utc"; // fallback
    const dtLocal = DateTime.fromFormat(dtBasic, fmt, { zone: fromZone });
    if (!dtLocal.isValid) return line;
    const conv = dtLocal.setZone(opts.targetTz);
    const convStr = conv.toFormat(hasSeconds ? "yyyyLLdd'T'HHmmss" : "yyyyLLdd'T'HHmm");
    const newParams = buildParams(params, `TZID=${opts.targetTz}`);
    return `${prop}${newParams}:${convStr}`;
  }

  // 3) Floating -> attach TZID without shifting (treat times as local wall clock)
  const newParams = buildParams(params, `TZID=${opts.targetTz}`);
  return `${prop}${newParams}:${dtBasic}`;
}

function transformIcs(ics: string, targetTz: string, overrideExistingTz: boolean): string {
  const lines = unfoldICSLines(ics);

  // Track if we're inside a VTIMEZONE block
  let insideVTimezone = false;

  // Transform DTSTART/DTEND/RECURRENCE-ID (but not inside VTIMEZONE blocks)
  const transformed = lines.map((line) => {
    const upper = line.toUpperCase();
    
    // Track VTIMEZONE blocks
    if (upper === "BEGIN:VTIMEZONE") {
      insideVTimezone = true;
      return line;
    }
    if (upper === "END:VTIMEZONE") {
      insideVTimezone = false;
      return line;
    }
    
    // Don't transform DTSTART/DTEND inside VTIMEZONE blocks
    if (insideVTimezone) {
      return line;
    }
    
    // Transform DTSTART/DTEND/RECURRENCE-ID/EXDATE outside VTIMEZONE blocks
    if (upper.startsWith("DTSTART") || upper.startsWith("DTEND") || upper.startsWith("RECURRENCE-ID") || upper.startsWith("EXDATE")) {
      return transformDateTimeLine(line, { targetTz, overrideExistingTz });
    }
    return line;
  });

  // Replace old VTIMEZONE blocks with target timezone block (Google Calendar compatible)
  if (isLikelyIana(targetTz)) {
    const hasTargetVtz = transformed.some((l) => 
      l.toUpperCase().startsWith("TZID:") && l.includes(targetTz)
    );
    if (!hasTargetVtz) {
      // Find and replace the first VTIMEZONE block
      const vtzStartIdx = transformed.findIndex((l) => l.toUpperCase().startsWith("BEGIN:VTIMEZONE"));
      if (vtzStartIdx >= 0) {
        const vtzEndIdx = transformed.findIndex((l, idx) => 
          idx > vtzStartIdx && l.toUpperCase().startsWith("END:VTIMEZONE")
        );
        if (vtzEndIdx >= 0) {
          // Replace the entire VTIMEZONE block
          const block = vtimezoneBlock(targetTz);
          transformed.splice(vtzStartIdx, vtzEndIdx - vtzStartIdx + 1, ...block);
        }
      } else {
        // No VTIMEZONE found, insert before first VEVENT
        const idx = transformed.findIndex((l) => l.toUpperCase().startsWith("BEGIN:VEVENT"));
        const block = vtimezoneBlock(targetTz);
        if (idx >= 0) transformed.splice(idx, 0, ...block);
        else transformed.push(...block);
      }
    }
  }

  // Update PRODID to be Google Calendar compatible
  const prodidIdx = transformed.findIndex((l) => l.toUpperCase().startsWith("PRODID:"));
  if (prodidIdx >= 0) {
    transformed[prodidIdx] = "PRODID:-//Google Inc//Google Calendar 70.9054//EN";
  }

  // Fix VEVENT structure: correct malformed descriptions and reorder fields
  const fixed = fixVEventStructure(transformed);

  return foldICSLines(fixed) + "\r\n"; // ICS should end with CRLF
}

// Fix VEVENT structure: correct malformed descriptions and reorder fields
// This ensures Google Calendar compatibility by:
// 1. Fixing malformed DESCRIPTION fields (incorrect line breaks)
// 2. Reordering fields to standard iCalendar order (UID, DTSTAMP, DTSTART, DTEND, SUMMARY, DESCRIPTION, etc.)
function fixVEventStructure(lines: string[]): string[] {
  const result: string[] = [];
  let currentVEvent: string[] = [];
  let insideVEvent = false;

  // Standard field order for VEVENT (RFC 5545 recommended order)
  const fieldOrder = [
    'UID',
    'DTSTAMP',
    'DTSTART',
    'DTEND',
    'DURATION',
    'RRULE',
    'RDATE',
    'EXDATE',
    'EXRULE',
    'RECURRENCE-ID',
    'SUMMARY',
    'DESCRIPTION',
    'LOCATION',
    'CLASS',
    'PRIORITY',
    'TRANSP',
    'STATUS',
    'SEQUENCE',
    'ORGANIZER',
    'ATTENDEE',
    'CREATED',
    'LAST-MODIFIED',
    'URL',
  ];

  function getFieldName(line: string): string {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) return '';
    const fieldPart = line.substring(0, colonIdx);
    const semicolonIdx = fieldPart.indexOf(';');
    return semicolonIdx === -1 ? fieldPart.toUpperCase() : fieldPart.substring(0, semicolonIdx).toUpperCase();
  }

  function fixDescription(descLines: string[]): string[] {
    if (descLines.length === 0) return [];
    
    // Extract the actual description content (remove "DESCRIPTION:" prefix and continuation spaces)
    const descParts: string[] = [];
    for (const line of descLines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx !== -1) {
        // First line: includes "DESCRIPTION:"
        descParts.push(line.substring(colonIdx + 1));
      } else if (line.startsWith(' ') || line.startsWith('\t')) {
        // Continuation line: starts with space/tab
        descParts.push(line.substring(1));
      } else {
        // Shouldn't happen, but handle it
        descParts.push(line);
      }
    }
    
    // Join all description parts
    let fullDesc = descParts.join('');
    
    // Fix malformed line breaks at the end
    // Remove trailing backslash followed by whitespace and newline
    // Pattern: "text\\\n" or "text\\ \n" should become "text"
    fullDesc = fullDesc.replace(/\\\s*$/g, '');
    
    // Remove any trailing standalone newline characters that shouldn't be there
    fullDesc = fullDesc.replace(/\n\s*$/g, '');
    
    // If description is empty after cleaning, return empty array
    if (fullDesc.trim().length === 0) {
      return [];
    }
    
    // Rebuild DESCRIPTION field with proper folding
    // The folding will be done by foldICSLines later, but we need to ensure
    // the first line starts with "DESCRIPTION:"
    const fixed: string[] = [];
    if (fullDesc.length <= 75) {
      fixed.push(`DESCRIPTION:${fullDesc}`);
    } else {
      // First line: "DESCRIPTION:" + up to 75 chars
      const firstLineContent = fullDesc.substring(0, 75);
      fixed.push(`DESCRIPTION:${firstLineContent}`);
      // Continuation lines: space + up to 74 chars
      for (let i = 75; i < fullDesc.length; i += 74) {
        const continuation = fullDesc.substring(i, i + 74);
        fixed.push(` ${continuation}`);
      }
    }
    
    return fixed;
  }

  function sortVEventFields(eventLines: string[]): string[] {
    const fields = new Map<string, string[]>();
    const xFields: string[] = []; // X-* fields go at the end
    const otherFields: string[] = []; // Unknown fields

    let currentField: string | null = null;
    let currentFieldLines: string[] = [];

    for (const line of eventLines) {
      const fieldName = getFieldName(line);
      
      if (fieldName === '') {
        // Continuation line
        if (currentField) {
          currentFieldLines.push(line);
        }
        continue;
      }

      // Save previous field
      if (currentField) {
        if (currentField.startsWith('X-')) {
          xFields.push(...currentFieldLines);
        } else if (fieldOrder.includes(currentField)) {
          fields.set(currentField, currentFieldLines);
        } else {
          otherFields.push(...currentFieldLines);
        }
        currentFieldLines = [];
      }

      currentField = fieldName;
      currentFieldLines.push(line);
    }

    // Save last field
    if (currentField) {
      if (currentField.startsWith('X-')) {
        xFields.push(...currentFieldLines);
      } else if (fieldOrder.includes(currentField)) {
        fields.set(currentField, currentFieldLines);
      } else {
        otherFields.push(...currentFieldLines);
      }
    }

    // Build sorted result
    const sorted: string[] = [];
    
    // Add fields in standard order
    for (const fieldName of fieldOrder) {
      const fieldLines = fields.get(fieldName);
      if (fieldLines) {
        // Special handling for DESCRIPTION: fix malformed content
        if (fieldName === 'DESCRIPTION') {
          sorted.push(...fixDescription(fieldLines));
        } else {
          sorted.push(...fieldLines);
        }
      }
    }
    
    // Add other known fields
    sorted.push(...otherFields);
    
    // Add X-* fields at the end
    sorted.push(...xFields);

    return sorted;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const upper = line.toUpperCase();

    if (upper === 'BEGIN:VEVENT') {
      insideVEvent = true;
      currentVEvent = [line];
      continue;
    }

    if (upper === 'END:VEVENT') {
      if (insideVEvent) {
        // Sort and fix the VEVENT
        const sorted = sortVEventFields(currentVEvent);
        result.push(...sorted);
        result.push('END:VEVENT');
        currentVEvent = [];
        insideVEvent = false;
      } else {
        result.push(line);
      }
      continue;
    }

    if (insideVEvent) {
      currentVEvent.push(line);
    } else {
      result.push(line);
    }
  }

  // Handle case where file ends without END:VEVENT (shouldn't happen, but be safe)
  if (insideVEvent && currentVEvent.length > 0) {
    const sorted = sortVEventFields(currentVEvent);
    result.push(...sorted);
    result.push('END:VEVENT');
  }

  return result;
}

// --- Express route ---------------------------------------------------------

app.get("/calendar.ics", async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const clientIP = req.ip || req.connection.remoteAddress || 'unknown';
  
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} from ${clientIP}`);
  console.log(`[${new Date().toISOString()}] Query params:`, req.query);
  
  try {
    const urlParam: unknown = req.query.url;
    const tzParam: unknown = req.query.tz;
    const overrideParam: unknown = req.query.override;

    const sourceUrl: string | undefined = typeof urlParam === "string" && urlParam.length > 0 ? urlParam : DEFAULT_URL;
    if (typeof sourceUrl !== "string" || sourceUrl.length === 0) {
      console.log(`[${new Date().toISOString()}] ERROR: Missing source ICS URL`);
      res.status(400).type("text/plain").send("Missing source ICS URL. Provide ?url=... or set SOURCE_ICS_URL env.");
      return;
    }

    const targetTz: string = isLikelyIana(tzParam) ? (tzParam as string) : DEFAULT_TZ;
    const overrideExistingTz: boolean = typeof overrideParam === "string" ? overrideParam === "1" : true; // Default to true to force TZID replacement
    
    console.log(`[${new Date().toISOString()}] Processing: sourceUrl=${sourceUrl}, targetTz=${targetTz}, override=${overrideExistingTz}`);

    const resp = await fetch(sourceUrl, { method: "GET" });
    if (!resp.ok) {
      console.log(`[${new Date().toISOString()}] ERROR: Upstream fetch failed (${resp.status})`);
      res.status(502).type("text/plain").send(`Upstream fetch failed (${resp.status})`);
      return;
    }
    const ics = await resp.text();
    if (typeof ics !== "string" || ics.length === 0) {
      console.log(`[${new Date().toISOString()}] ERROR: Upstream returned empty body`);
      res.status(502).type("text/plain").send("Upstream returned empty body");
      return;
    }

    console.log(`[${new Date().toISOString()}] Fetched ICS data: ${ics.length} characters`);

    const out = transformIcs(ics, targetTz, overrideExistingTz);

    console.log(`[${new Date().toISOString()}] Transformed ICS data: ${out.length} characters`);

    // Cache politely for 10 minutes; adjust to your needs
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=600");
    res.status(200).send(out);
    
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] SUCCESS: Request completed in ${duration}ms`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    const duration = Date.now() - startTime;
    console.log(`[${new Date().toISOString()}] ERROR: ${msg} (${duration}ms)`);
    res.status(500).type("text/plain").send(`Proxy error: ${msg}`);
  }
});

const portStr: string = process.env.PORT ?? "3000";
const portNum: number = Number(portStr);
const port: number = Number.isFinite(portNum) ? portNum : 3000;

app.listen(port, () => {
  console.log(`[${new Date().toISOString()}] ========================================`);
  console.log(`[${new Date().toISOString()}] ICS Timezone Proxy Server Started`);
  console.log(`[${new Date().toISOString()}] ========================================`);
  console.log(`[${new Date().toISOString()}] Server listening on: http://localhost:${port}`);
  console.log(`[${new Date().toISOString()}] Calendar endpoint: http://localhost:${port}/calendar.ics`);
  console.log(`[${new Date().toISOString()}] Default timezone: ${DEFAULT_TZ}`);
  console.log(`[${new Date().toISOString()}] Add VTIMEZONE blocks: Always (Google Calendar compatible)`);
  console.log(`[${new Date().toISOString()}] CORS: Enabled for all origins`);
  console.log(`[${new Date().toISOString()}] ========================================`);
});
