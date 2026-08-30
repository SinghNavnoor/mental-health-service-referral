import type { PandaDocListItem, ReferralPayload } from "../types.js";
import { pandaDocFetch } from "./client.js";
import {
  buildDocumentNameQuery,
  pickClosestByProgramStartDate,
} from "./programPacketMap.js";

export { buildDocumentNameQuery } from "./programPacketMap.js";

export async function findConsentPacket(
  apiKey: string,
  payload: ReferralPayload
): Promise<PandaDocListItem> {
  const stem = buildDocumentNameQuery(payload.programName, payload.clientName);
  const q = encodeURIComponent(stem);
  const res = await pandaDocFetch(
    apiKey,
    `/public/v1/documents?q=${q}&count=25`
  );
  if (!res.ok) {
    throw new Error(`PandaDoc list failed: ${res.status}`);
  }
  const data = (await res.json()) as { results?: PandaDocListItem[] };
  const results = data.results ?? [];
  const stemLower = stem.toLowerCase();
  const filtered = results.filter((r) =>
    r.name.toLowerCase().includes(stemLower)
  );
  return pickClosestByProgramStartDate(filtered, payload.programStartDate);
}
