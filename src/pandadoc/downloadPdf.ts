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
      break;
    }
  }
  throw lastError ?? new Error("PandaDoc download failed");
}
