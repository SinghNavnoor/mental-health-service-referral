import type { VercelRequest, VercelResponse } from "@vercel/node";
import { loadConfig } from "../src/config.js";
import {
  parseReferralPayload,
  verifyWebhookSecret,
} from "../src/auth/verifyWebhook.js";
import { isReferralEligiblePipeline } from "../src/pandadoc/programPacketMap.js";
import { runReferralPipeline } from "../src/pipeline.js";

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

  if (
    !verifyWebhookSecret(req.headers["x-webhook-secret"], config.webhookSecret)
  ) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const payload = parseReferralPayload(req.body);
    if (!isReferralEligiblePipeline(payload.programName)) {
      console.info("referral_skipped", {
        reason: "pipeline_not_eligible",
        programId: payload.programId,
        programName: payload.programName,
      });
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: "pipeline_not_eligible",
        programId: payload.programId,
        programName: payload.programName,
      });
    }

    const result = await runReferralPipeline(config, payload);
    return res.status(200).json({ ok: true, ...result });
  } catch (e) {
    const message = (e as Error).message;
    const status = /no matching|could not find/i.test(message)
      ? 422
      : /unauthorized/i.test(message)
        ? 401
        : /invalid payload/i.test(message)
          ? 400
          : 502;
    console.error("referral_failed", {
      message,
      programId: (req.body as { programId?: string } | undefined)?.programId,
    });
    return res.status(status).json({ error: message });
  }
}
