# Mental Health Service Referral Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a HubSpot Program record is created, find the matching PandaDoc consent packet, extract English + Spanish Consent to Release Information pages by text (not page number), and email them via Outlook to a fixed mental health provider address.

**Architecture:** HubSpot Workflow on Program create POSTs to a Vercel serverless endpoint. The service validates a shared secret, searches PandaDoc by document name, downloads the completed PDF, scans page text for ROI titles, and sends mail through Microsoft Graph with both PDF attachments.

**Tech Stack:** TypeScript, Vercel Node serverless functions, `pdf-lib` + `pdf-parse` (or `pdfjs-dist`) for PDF page extract, PandaDoc REST API, Microsoft Graph `sendMail`, HubSpot Workflow webhook, Vitest.

**Spec:** `docs/superpowers/specs/2026-07-22-mental-health-referral-design.md`

## Global Constraints

- Attach **both** English and Spanish ROI forms every time.
- Find ROI pages by **page text title match only** — never by hard-coded page indexes.
- English match: `Consent to Release Information`
- Spanish match: `Consentimiento Para Divulgar`
- Document name pattern: `{ProgramName} Consent Form Packet - {FirstName} {LastName} - {CreatedDate}`
- Email via Outlook / Microsoft Graph only.
- Recipient and from mailbox come from env vars (user supplies later).
- Do not put PDF extraction inside HubSpot custom code.
- Do not commit secrets; use `.env.example` only.
- Treat client data as sensitive: no PDF bytes in logs.

---

## File Structure

```
Mental Health Service Referral/
├── plan.md
├── docs/superpowers/specs/2026-07-22-mental-health-referral-design.md
├── package.json
├── tsconfig.json
├── vercel.json
├── .env.example
├── .gitignore
├── README.md
├── hubspot/
│   └── workflow-setup.md
├── api/
│   └── referral.ts                 # Vercel entry: POST webhook
├── src/
│   ├── config.ts                   # env validation
│   ├── types.ts                    # shared types
│   ├── pipeline.ts                 # orchestrates end-to-end
│   ├── auth/
│   │   └── verifyWebhook.ts
│   ├── pandadoc/
│   │   ├── client.ts
│   │   ├── findDocument.ts
│   │   └── downloadPdf.ts
│   ├── pdf/
│   │   └── extractRoiPages.ts
│   └── outlook/
│       ├── graphToken.ts
│       └── sendReferralEmail.ts
├── tests/
│   ├── fixtures/
│   │   └── sample-packet.pdf       # copy from Panda Doc Document/
│   ├── extractRoiPages.test.ts
│   ├── findDocument.test.ts
│   ├── verifyWebhook.test.ts
│   └── pipeline.test.ts
└── Panda Doc Document/
    └── Youth Consent Form Packet - [Client.FirstName] [Client.LastName] - [Document.CreatedDate].pdf
```

---

### Task 1: Scaffold TypeScript + Vercel project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vercel.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `src/types.ts`
- Create: `src/config.ts`

**Interfaces:**
- Produces: `ReferralPayload`, `AppConfig`, `loadConfig()`

- [ ] **Step 1: Init package and deps**

```bash
cd /path/to/mental-health-service-referral
npm init -y
npm install pdf-lib pdf-parse @vercel/node
npm install -D typescript vitest @types/node @types/pdf-parse tsx
```

- [ ] **Step 2: Write `package.json` scripts**

```json
{
  "name": "mental-health-service-referral",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "dev": "vercel dev"
  }
}
```

- [ ] **Step 3: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node", "vitest/globals"]
  },
  "include": ["api/**/*.ts", "src/**/*.ts", "tests/**/*.ts"]
}
```

- [ ] **Step 4: Write `vercel.json`**

```json
{
  "functions": {
    "api/referral.ts": {
      "maxDuration": 60
    }
  }
}
```

- [ ] **Step 5: Write `.gitignore` and `.env.example`**

`.gitignore`:
```
node_modules/
.vercel/
dist/
.env
.env.local
*.log
.DS_Store
```

`.env.example`:
```
WEBHOOK_SECRET=replace-me
PANDADOC_API_KEY=replace-me
AZURE_TENANT_ID=replace-me
AZURE_CLIENT_ID=replace-me
AZURE_CLIENT_SECRET=replace-me
OUTLOOK_FROM_USER=referrals@example.org
OUTLOOK_TO_EMAIL=provider@example.org
```

- [ ] **Step 6: Write `src/types.ts`**

```ts
export type ReferralPayload = {
  programId: string;
  programName: string;
  firstName: string;
  lastName: string;
  createdDate: string;
  dateOfBirth?: string;
  phone?: string;
  email?: string;
  /** Extra HubSpot fields included in the email body */
  extraFields?: Record<string, string>;
};

export type RoiExtractionResult = {
  englishPdf: Uint8Array;
  spanishPdf: Uint8Array;
  englishPageIndexes: number[];
  spanishPageIndexes: number[];
};

export type PandaDocListItem = {
  id: string;
  name: string;
  status: string;
  date_created?: string;
  date_completed?: string;
};
```

- [ ] **Step 7: Write `src/config.ts`**

```ts
export type AppConfig = {
  webhookSecret: string;
  pandaDocApiKey: string;
  azureTenantId: string;
  azureClientId: string;
  azureClientSecret: string;
  outlookFromUser: string;
  outlookToEmail: string;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const required = [
    "WEBHOOK_SECRET",
    "PANDADOC_API_KEY",
    "AZURE_TENANT_ID",
    "AZURE_CLIENT_ID",
    "AZURE_CLIENT_SECRET",
    "OUTLOOK_FROM_USER",
    "OUTLOOK_TO_EMAIL",
  ] as const;

  for (const key of required) {
    if (!env[key]?.trim()) {
      throw new Error(`Missing required env var: ${key}`);
    }
  }

  return {
    webhookSecret: env.WEBHOOK_SECRET!,
    pandaDocApiKey: env.PANDADOC_API_KEY!,
    azureTenantId: env.AZURE_TENANT_ID!,
    azureClientId: env.AZURE_CLIENT_ID!,
    azureClientSecret: env.AZURE_CLIENT_SECRET!,
    outlookFromUser: env.OUTLOOK_FROM_USER!,
    outlookToEmail: env.OUTLOOK_TO_EMAIL!,
  };
}
```

- [ ] **Step 8: Commit**

```bash
git init
git add package.json tsconfig.json vercel.json .gitignore .env.example src/types.ts src/config.ts
git commit -m "chore: scaffold Vercel TypeScript project for MH referral"
```

---

### Task 2: Webhook auth + payload parsing

**Files:**
- Create: `src/auth/verifyWebhook.ts`
- Create: `tests/verifyWebhook.test.ts`
- Create: `api/referral.ts` (stub that only validates auth + parses body)

**Interfaces:**
- Consumes: `AppConfig.webhookSecret`
- Produces: `verifyWebhookSecret(headerValue, secret): boolean`, `parseReferralPayload(body): ReferralPayload`

- [ ] **Step 1: Write failing tests**

```ts
// tests/verifyWebhook.test.ts
import { describe, it, expect } from "vitest";
import { verifyWebhookSecret, parseReferralPayload } from "../src/auth/verifyWebhook.js";

describe("verifyWebhookSecret", () => {
  it("accepts exact match", () => {
    expect(verifyWebhookSecret("abc123", "abc123")).toBe(true);
  });
  it("rejects mismatch", () => {
    expect(verifyWebhookSecret("nope", "abc123")).toBe(false);
  });
  it("rejects missing header", () => {
    expect(verifyWebhookSecret(undefined, "abc123")).toBe(false);
  });
});

describe("parseReferralPayload", () => {
  it("maps HubSpot-style body fields", () => {
    const payload = parseReferralPayload({
      programId: "123",
      programName: "Regional RRH",
      firstName: "Jane",
      lastName: "Doe",
      createdDate: "Jul 17, 2026",
      dateOfBirth: "2000-01-01",
      phone: "555-0100",
    });
    expect(payload.programName).toBe("Regional RRH");
    expect(payload.firstName).toBe("Jane");
  });

  it("throws when required fields missing", () => {
    expect(() => parseReferralPayload({ programName: "Youth" })).toThrow(/firstName/i);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- tests/verifyWebhook.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement `src/auth/verifyWebhook.ts`**

```ts
import type { ReferralPayload } from "../types.js";

export function verifyWebhookSecret(
  headerValue: string | string[] | undefined,
  secret: string
): boolean {
  const value = Array.isArray(headerValue) ? headerValue[0] : headerValue;
  if (!value || !secret) return false;
  return value === secret;
}

export function parseReferralPayload(body: unknown): ReferralPayload {
  if (!body || typeof body !== "object") {
    throw new Error("Invalid payload: expected object");
  }
  const b = body as Record<string, unknown>;
  const required = ["programId", "programName", "firstName", "lastName", "createdDate"] as const;
  for (const key of required) {
    if (typeof b[key] !== "string" || !(b[key] as string).trim()) {
      throw new Error(`Invalid payload: missing ${key}`);
    }
  }

  return {
    programId: String(b.programId).trim(),
    programName: String(b.programName).trim(),
    firstName: String(b.firstName).trim(),
    lastName: String(b.lastName).trim(),
    createdDate: String(b.createdDate).trim(),
    dateOfBirth: optionalString(b.dateOfBirth),
    phone: optionalString(b.phone),
    email: optionalString(b.email),
    extraFields:
      b.extraFields && typeof b.extraFields === "object"
        ? Object.fromEntries(
            Object.entries(b.extraFields as Record<string, unknown>).map(([k, v]) => [
              k,
              String(v ?? ""),
            ])
          )
        : undefined,
  };
}

function optionalString(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t || undefined;
}
```

- [ ] **Step 4: Stub `api/referral.ts`**

```ts
import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadConfig } from "../src/config.js";
import { parseReferralPayload, verifyWebhookSecret } from "../src/auth/verifyWebhook.js";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  let config;
  try {
    config = loadConfig();
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message });
  }

  if (!verifyWebhookSecret(req.headers["x-webhook-secret"], config.webhookSecret)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = parseReferralPayload(req.body);
    return res.status(200).json({ ok: true, received: payload.programId });
  } catch (e) {
    return res.status(400).json({ error: (e as Error).message });
  }
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npm test -- tests/verifyWebhook.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/auth/verifyWebhook.ts api/referral.ts tests/verifyWebhook.test.ts
git commit -m "feat: add webhook secret check and referral payload parsing"
```

---

### Task 3: PandaDoc find + download

**Files:**
- Create: `src/pandadoc/client.ts`
- Create: `src/pandadoc/findDocument.ts`
- Create: `src/pandadoc/downloadPdf.ts`
- Create: `tests/findDocument.test.ts`

**Interfaces:**
- Consumes: `PANDADOC_API_KEY`, `ReferralPayload`
- Produces:
  - `buildDocumentNameQuery(payload): string`
  - `findConsentPacket(apiKey, payload): Promise<PandaDocListItem>`
  - `downloadCompletedPdf(apiKey, documentId): Promise<Uint8Array>`

PandaDoc APIs:
- List/search: `GET https://api.pandadoc.com/public/v1/documents?q={query}`
- Auth header: `Authorization: API-Key {key}`
- Completed PDF: try `GET /public/v1/documents/{id}/download-protected` first; on failure/404 fall back to `/download`
- If response `202`, honor `Retry-After` and retry up to 5 times

- [ ] **Step 1: Write name builder + matcher tests**

```ts
// tests/findDocument.test.ts
import { describe, it, expect } from "vitest";
import {
  buildDocumentNameQuery,
  pickBestDocumentMatch,
} from "../src/pandadoc/findDocument.js";
import type { PandaDocListItem } from "../src/types.js";

describe("buildDocumentNameQuery", () => {
  it("builds expected packet name stem", () => {
    const q = buildDocumentNameQuery({
      programId: "1",
      programName: "Regional RRH",
      firstName: "Jane",
      lastName: "Doe",
      createdDate: "Jul 17, 2026",
    });
    expect(q).toBe("Regional RRH Consent Form Packet - Jane Doe");
  });
});

describe("pickBestDocumentMatch", () => {
  const candidates: PandaDocListItem[] = [
    {
      id: "a",
      name: "Regional RRH Consent Form Packet - Jane Doe - Jul 17, 2026",
      status: "document.completed",
    },
    {
      id: "b",
      name: "Regional RRH Consent Form Packet - Jane Doe - Jul 10, 2026",
      status: "document.completed",
    },
  ];

  it("prefers name containing createdDate when present", () => {
    const best = pickBestDocumentMatch(candidates, "Jul 17, 2026");
    expect(best.id).toBe("a");
  });

  it("throws when no candidates", () => {
    expect(() => pickBestDocumentMatch([], "Jul 17, 2026")).toThrow(/no matching/i);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm test -- tests/findDocument.test.ts
```

- [ ] **Step 3: Implement find + download modules**

```ts
// src/pandadoc/client.ts
export async function pandaDocFetch(
  apiKey: string,
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `API-Key ${apiKey}`);
  return fetch(`https://api.pandadoc.com${path}`, { ...init, headers });
}
```

```ts
// src/pandadoc/findDocument.ts
import type { PandaDocListItem, ReferralPayload } from "../types.js";
import { pandaDocFetch } from "./client.js";

export function buildDocumentNameQuery(payload: ReferralPayload): string {
  return `${payload.programName} Consent Form Packet - ${payload.firstName} ${payload.lastName}`;
}

export function pickBestDocumentMatch(
  items: PandaDocListItem[],
  createdDate: string
): PandaDocListItem {
  if (!items.length) {
    throw new Error("No matching PandaDoc consent packet found");
  }
  const withDate = items.filter((i) =>
    i.name.toLowerCase().includes(createdDate.toLowerCase())
  );
  const pool = withDate.length ? withDate : items;
  // Prefer completed docs
  const completed = pool.filter((i) => i.status === "document.completed");
  return (completed[0] ?? pool[0])!;
}

export async function findConsentPacket(
  apiKey: string,
  payload: ReferralPayload
): Promise<PandaDocListItem> {
  const q = encodeURIComponent(buildDocumentNameQuery(payload));
  const res = await pandaDocFetch(apiKey, `/public/v1/documents?q=${q}&count=20`);
  if (!res.ok) {
    throw new Error(`PandaDoc list failed: ${res.status}`);
  }
  const data = (await res.json()) as { results?: PandaDocListItem[] };
  const results = data.results ?? [];
  const stem = buildDocumentNameQuery(payload).toLowerCase();
  const filtered = results.filter((r) => r.name.toLowerCase().includes(stem));
  return pickBestDocumentMatch(filtered, payload.createdDate);
}
```

```ts
// src/pandadoc/downloadPdf.ts
import { pandaDocFetch } from "./client.js";

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

export async function downloadCompletedPdf(
  apiKey: string,
  documentId: string
): Promise<Uint8Array> {
  const paths = [
    `/public/v1/documents/${documentId}/download-protected`,
    `/public/v1/documents/${documentId}/download`,
  ];

  let lastError: Error | undefined;
  for (const path of paths) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const res = await pandaDocFetch(apiKey, path);
      if (res.status === 202) {
        const retryAfter = Number(res.headers.get("Retry-After") ?? "3");
        await sleep(Math.max(1, retryAfter) * 1000);
        continue;
      }
      if (res.ok) {
        return new Uint8Array(await res.arrayBuffer());
      }
      lastError = new Error(`PandaDoc download failed: ${res.status} ${path}`);
      break; // try next path
    }
  }
  throw lastError ?? new Error("PandaDoc download failed");
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm test -- tests/findDocument.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/pandadoc tests/findDocument.test.ts
git commit -m "feat: find and download PandaDoc consent packet PDF"
```

---

### Task 4: Extract ROI pages by text (not page numbers)

**Files:**
- Create: `src/pdf/extractRoiPages.ts`
- Create: `tests/extractRoiPages.test.ts`
- Create: `tests/fixtures/sample-packet.pdf` (copy of shared sample)

**Interfaces:**
- Consumes: full packet `Uint8Array`
- Produces: `extractRoiPages(pdfBytes): Promise<RoiExtractionResult>`

Detection rules:
- Normalize page text: lowercase, collapse whitespace
- English if includes `consent to release information`
- Spanish if includes `consentimiento para divulgar`
- Ignore checklist/TOC pages that only *mention* the form in a table of contents **if** the page does not also contain the statement-of-consent body markers:
  - English body marker: `statement of consent`
  - Spanish body marker: `declaración de consentimiento` OR `doy mi consentimiento`
- Build a new single-/multi-page PDF per language using `pdf-lib` `copyPages`

- [ ] **Step 1: Copy fixture**

```bash
mkdir -p tests/fixtures
cp "Panda Doc Document/Youth Consent Form Packet - [Client.FirstName] [Client.LastName] - [Document.CreatedDate].pdf" \
  tests/fixtures/sample-packet.pdf
```

- [ ] **Step 2: Write failing test against real sample**

```ts
// tests/extractRoiPages.test.ts
import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { PDFDocument } from "pdf-lib";
import { extractRoiPages } from "../src/pdf/extractRoiPages.js";

describe("extractRoiPages", () => {
  it("finds English and Spanish ROI by text, not fixed indexes", async () => {
    const bytes = readFileSync("tests/fixtures/sample-packet.pdf");
    const result = await extractRoiPages(new Uint8Array(bytes));

    expect(result.englishPageIndexes.length).toBeGreaterThan(0);
    expect(result.spanishPageIndexes.length).toBeGreaterThan(0);
    // Must NOT be a brittle assumption that EN is always page 6 — but for this fixture it is 6/7 (0-based 5/6)
    // Assert content presence instead of forbidding those indexes.
    const enDoc = await PDFDocument.load(result.englishPdf);
    const esDoc = await PDFDocument.load(result.spanishPdf);
    expect(enDoc.getPageCount()).toBeGreaterThanOrEqual(1);
    expect(esDoc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it("throws if either language missing", async () => {
    const empty = await PDFDocument.create();
    empty.addPage();
    const bytes = await empty.save();
    await expect(extractRoiPages(bytes)).rejects.toThrow(/release information|divulgar/i);
  });
});
```

- [ ] **Step 3: Run test — expect FAIL**

```bash
npm test -- tests/extractRoiPages.test.ts
```

- [ ] **Step 4: Implement extractor**

```ts
// src/pdf/extractRoiPages.ts
import { PDFDocument } from "pdf-lib";
// pdf-parse default export works in CJS interop; wrap if needed
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import type { RoiExtractionResult } from "../types.js";

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function isEnglishRoi(text: string): boolean {
  const n = normalize(text);
  return (
    n.includes("consent to release information") &&
    n.includes("statement of consent")
  );
}

function isSpanishRoi(text: string): boolean {
  const n = normalize(text);
  return (
    n.includes("consentimiento para divulgar") &&
    (n.includes("declaración de consentimiento") ||
      n.includes("doy mi consentimiento"))
  );
}

async function extractPageText(fullPdf: Uint8Array, pageIndex: number): Promise<string> {
  // Strategy: build one-page PDF then pdf-parse it (avoids relying on page numbers in business logic)
  const src = await PDFDocument.load(fullPdf);
  const one = await PDFDocument.create();
  const [copied] = await one.copyPages(src, [pageIndex]);
  one.addPage(copied);
  const oneBytes = await one.save();
  const parsed = await pdfParse(Buffer.from(oneBytes));
  return parsed.text ?? "";
}

export async function extractRoiPages(pdfBytes: Uint8Array): Promise<RoiExtractionResult> {
  const src = await PDFDocument.load(pdfBytes);
  const pageCount = src.getPageCount();
  const englishPageIndexes: number[] = [];
  const spanishPageIndexes: number[] = [];

  for (let i = 0; i < pageCount; i++) {
    const text = await extractPageText(pdfBytes, i);
    if (isEnglishRoi(text)) englishPageIndexes.push(i);
    if (isSpanishRoi(text)) spanishPageIndexes.push(i);
  }

  if (!englishPageIndexes.length) {
    throw new Error("Could not find English Consent to Release Information page by text");
  }
  if (!spanishPageIndexes.length) {
    throw new Error("Could not find Spanish Consentimiento Para Divulgar page by text");
  }

  async function buildSubset(indexes: number[]): Promise<Uint8Array> {
    const out = await PDFDocument.create();
    const pages = await out.copyPages(src, indexes);
    for (const p of pages) out.addPage(p);
    return out.save();
  }

  return {
    englishPdf: await buildSubset(englishPageIndexes),
    spanishPdf: await buildSubset(spanishPageIndexes),
    englishPageIndexes,
    spanishPageIndexes,
  };
}
```

> If `pdf-parse` import path fails under ESM, switch to `pdfjs-dist` getTextContent per page — same title predicates, same tests.

- [ ] **Step 5: Run tests — expect PASS**

```bash
npm test -- tests/extractRoiPages.test.ts
```

Expected: PASS against the real 24-page sample; English/Spanish pages found via text.

- [ ] **Step 6: Commit**

```bash
git add src/pdf/extractRoiPages.ts tests/extractRoiPages.test.ts tests/fixtures/sample-packet.pdf
git commit -m "feat: extract EN/ES ROI pages from packet by page text"
```

---

### Task 5: Outlook send via Microsoft Graph

**Files:**
- Create: `src/outlook/graphToken.ts`
- Create: `src/outlook/sendReferralEmail.ts`
- Create: `tests/sendReferralEmail.test.ts` (unit test with mocked `fetch`)

**Interfaces:**
- Consumes: Azure app credentials, `OUTLOOK_FROM_USER`, `OUTLOOK_TO_EMAIL`, `ReferralPayload`, ROI PDF bytes
- Produces: `getGraphToken(config): Promise<string>`, `sendReferralEmail(...): Promise<void>`

Azure app setup (manual, documented in README):
1. App registration in Entra ID
2. Application permission `Mail.Send`
3. Admin consent
4. Client secret

Graph call:
`POST https://graph.microsoft.com/v1.0/users/{OUTLOOK_FROM_USER}/sendMail`

- [ ] **Step 1: Write failing mock test**

```ts
// tests/sendReferralEmail.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { sendReferralEmail } from "../src/outlook/sendReferralEmail.js";

describe("sendReferralEmail", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("posts Graph sendMail with two PDF attachments", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 202 });
    vi.stubGlobal("fetch", fetchMock);

    await sendReferralEmail({
      accessToken: "token",
      fromUser: "from@example.org",
      toEmail: "provider@example.org",
      payload: {
        programId: "p1",
        programName: "Youth",
        firstName: "Jane",
        lastName: "Doe",
        createdDate: "Jul 17, 2026",
        phone: "555-0100",
      },
      englishPdf: new Uint8Array([1, 2, 3]),
      spanishPdf: new Uint8Array([4, 5, 6]),
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/users/from@example.org/sendMail");
    const body = JSON.parse(init.body as string);
    expect(body.message.toRecipients[0].emailAddress.address).toBe("provider@example.org");
    expect(body.message.attachments).toHaveLength(2);
    expect(body.message.attachments[0].contentType).toBe("application/pdf");
  });
});
```

- [ ] **Step 2: Implement token + send**

```ts
// src/outlook/graphToken.ts
import type { AppConfig } from "../config.js";

export async function getGraphToken(config: AppConfig): Promise<string> {
  const url = `https://login.microsoftonline.com/${config.azureTenantId}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: config.azureClientId,
    client_secret: config.azureClientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    throw new Error(`Graph token failed: ${res.status}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}
```

```ts
// src/outlook/sendReferralEmail.ts
import type { ReferralPayload } from "../types.js";

export type SendReferralEmailArgs = {
  accessToken: string;
  fromUser: string;
  toEmail: string;
  payload: ReferralPayload;
  englishPdf: Uint8Array;
  spanishPdf: Uint8Array;
};

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}

function buildBody(payload: ReferralPayload): string {
  const lines = [
    "Mental health service referral",
    "",
    `Program: ${payload.programName}`,
    `Client: ${payload.firstName} ${payload.lastName}`,
    `HubSpot Program ID: ${payload.programId}`,
    `Program / packet date: ${payload.createdDate}`,
  ];
  if (payload.dateOfBirth) lines.push(`Date of birth: ${payload.dateOfBirth}`);
  if (payload.phone) lines.push(`Phone: ${payload.phone}`);
  if (payload.email) lines.push(`Email: ${payload.email}`);
  if (payload.extraFields) {
    for (const [k, v] of Object.entries(payload.extraFields)) {
      lines.push(`${k}: ${v}`);
    }
  }
  lines.push(
    "",
    "Attached: Consent to Release Information (English) and Consentimiento Para Divulgar Información (Spanish)."
  );
  return lines.join("\n");
}

export async function sendReferralEmail(args: SendReferralEmailArgs): Promise<void> {
  const subject = `Mental Health Referral – ${args.payload.firstName} ${args.payload.lastName} – ${args.payload.programName}`;
  const res = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(args.fromUser)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${args.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: "Text", content: buildBody(args.payload) },
          toRecipients: [
            { emailAddress: { address: args.toEmail } },
          ],
          attachments: [
            {
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: "Consent-to-Release-Information-EN.pdf",
              contentType: "application/pdf",
              contentBytes: toBase64(args.englishPdf),
            },
            {
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: "Consentimiento-Para-Divulgar-Informacion-ES.pdf",
              contentType: "application/pdf",
              contentBytes: toBase64(args.spanishPdf),
            },
          ],
        },
        saveToSentItems: true,
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Outlook sendMail failed: ${res.status} ${text}`);
  }
}
```

- [ ] **Step 3: Run tests — expect PASS**

```bash
npm test -- tests/sendReferralEmail.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/outlook tests/sendReferralEmail.test.ts
git commit -m "feat: send referral email with ROI PDFs via Microsoft Graph"
```

---

### Task 6: Pipeline + wire `api/referral.ts`

**Files:**
- Create: `src/pipeline.ts`
- Create: `tests/pipeline.test.ts`
- Modify: `api/referral.ts`

**Interfaces:**
- Consumes: all modules above
- Produces: `runReferralPipeline(config, payload): Promise<{ documentId: string; englishPages: number[]; spanishPages: number[] }>`

- [ ] **Step 1: Implement pipeline**

```ts
// src/pipeline.ts
import type { AppConfig } from "./config.js";
import type { ReferralPayload } from "./types.js";
import { findConsentPacket } from "./pandadoc/findDocument.js";
import { downloadCompletedPdf } from "./pandadoc/downloadPdf.js";
import { extractRoiPages } from "./pdf/extractRoiPages.js";
import { getGraphToken } from "./outlook/graphToken.js";
import { sendReferralEmail } from "./outlook/sendReferralEmail.js";

export async function runReferralPipeline(config: AppConfig, payload: ReferralPayload) {
  const doc = await findConsentPacket(config.pandaDocApiKey, payload);
  const pdfBytes = await downloadCompletedPdf(config.pandaDocApiKey, doc.id);
  const roi = await extractRoiPages(pdfBytes);
  const token = await getGraphToken(config);
  await sendReferralEmail({
    accessToken: token,
    fromUser: config.outlookFromUser,
    toEmail: config.outlookToEmail,
    payload,
    englishPdf: roi.englishPdf,
    spanishPdf: roi.spanishPdf,
  });
  return {
    documentId: doc.id,
    documentName: doc.name,
    englishPages: roi.englishPageIndexes,
    spanishPages: roi.spanishPageIndexes,
  };
}
```

- [ ] **Step 2: Update `api/referral.ts` to call pipeline**

Replace the stub success branch with:

```ts
import { runReferralPipeline } from "../src/pipeline.js";
// ...
try {
  const payload = parseReferralPayload(req.body);
  const result = await runReferralPipeline(config, payload);
  return res.status(200).json({ ok: true, ...result });
} catch (e) {
  const message = (e as Error).message;
  const status =
    /no matching|could not find/i.test(message) ? 422 :
    /unauthorized/i.test(message) ? 401 : 502;
  console.error("referral_failed", { message, programId: (req.body as any)?.programId });
  return res.status(status).json({ error: message });
}
```

- [ ] **Step 3: Pipeline unit test with mocks**

Mock `findConsentPacket`, `downloadCompletedPdf`, `extractRoiPages`, `getGraphToken`, `sendReferralEmail` — assert call order and that send receives both PDFs.

- [ ] **Step 4: Run full suite**

```bash
npm test
npm run typecheck
```

Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/pipeline.ts api/referral.ts tests/pipeline.test.ts
git commit -m "feat: wire end-to-end referral pipeline to Vercel webhook"
```

---

### Task 7: HubSpot workflow setup docs + README

**Files:**
- Create: `hubspot/workflow-setup.md`
- Create: `README.md`

- [ ] **Step 1: Write HubSpot setup guide**

Contents of `hubspot/workflow-setup.md`:

1. Create Workflow on **Program** object → enrollment trigger: **record created**.
2. Add action: **Send webhook** (or Custom Code that `axios.post`s if webhook action unavailable).
3. URL: `https://{your-vercel-domain}/api/referral`
4. Header: `x-webhook-secret: {WEBHOOK_SECRET}`
5. JSON body property mapping (adjust internal names to match HubSpot):

```json
{
  "programId": "{{ program.hs_object_id }}",
  "programName": "{{ program.<program_name_or_type_property> }}",
  "firstName": "{{ program.<client_first_name_property> }}",
  "lastName": "{{ program.<client_last_name_property> }}",
  "createdDate": "{{ program.<packet_or_create_date_property> }}",
  "dateOfBirth": "{{ program.<dob_property> }}",
  "phone": "{{ program.<phone_property> }}",
  "email": "{{ program.<email_property> }}"
}
```

6. Note: confirm exact Program property internal names in HubSpot settings before go-live.
7. Confirm PandaDoc document title date format matches what HubSpot sends (may need a formatted date property).

- [ ] **Step 2: Write README**

Cover: purpose, architecture diagram (text), env vars, Azure app permissions (`Mail.Send` application), PandaDoc API key, deploy (`vercel`), local test with sample PDF unit tests, manual curl:

```bash
curl -X POST http://localhost:3000/api/referral \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: $WEBHOOK_SECRET" \
  -d '{
    "programId": "test-1",
    "programName": "Youth",
    "firstName": "Jane",
    "lastName": "Doe",
    "createdDate": "Jul 17, 2026"
  }'
```

- [ ] **Step 3: Commit**

```bash
git add hubspot/workflow-setup.md README.md
git commit -m "docs: HubSpot workflow setup and project README"
```

---

### Task 8: Deploy + live integration checklist

**Files:** none (ops)

- [ ] **Step 1: Deploy to Vercel**

```bash
npx vercel --yes
npx vercel env add WEBHOOK_SECRET
npx vercel env add PANDADOC_API_KEY
npx vercel env add AZURE_TENANT_ID
npx vercel env add AZURE_CLIENT_ID
npx vercel env add AZURE_CLIENT_SECRET
npx vercel env add OUTLOOK_FROM_USER
npx vercel env add OUTLOOK_TO_EMAIL
npx vercel --prod
```

- [ ] **Step 2: User supplies missing values**

- Fixed provider `OUTLOOK_TO_EMAIL`
- Sending mailbox `OUTLOOK_FROM_USER`
- PandaDoc API key
- Azure app credentials
- Exact HubSpot Program property internal names
- Real PandaDoc date format used in document titles

- [ ] **Step 3: End-to-end test with one real completed packet**

1. Pick a known completed PandaDoc consent packet.
2. Create/test-enroll a Program in HubSpot with matching name fields (or curl the webhook with those fields).
3. Confirm email arrives with both attachments.
4. Open attachments and confirm they are ROI forms (not TOC / other releases).

- [ ] **Step 4: Failure drills**

- Wrong client name → 422, no email
- Packet without ROI text → 422
- Bad webhook secret → 401

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| HubSpot Program create trigger | Task 7 |
| Vercel webhook service | Tasks 1–2, 6, 8 |
| PandaDoc name search | Task 3 |
| Download completed PDF | Task 3 |
| Attach both EN + ES ROI | Tasks 4–5 |
| Text-based page find (no page numbers) | Task 4 |
| Outlook / Graph email | Task 5 |
| Fixed recipient + configurable from | Task 1 `.env.example`, Task 5 |
| Error handling / no partial send | Task 6 |

No intentional placeholders for implementation logic; only runtime secrets/property internal names that the user will supply later (explicitly listed in Task 8).

---

## Execution handoff

Plan complete and saved to `plan.md` (also mirrored under `docs/superpowers/specs/` for the design).

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — implement tasks in this session with checkpoints  

Which approach?
