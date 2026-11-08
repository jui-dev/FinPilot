import type { ServiceContext } from "@/server/context";
import type { ExportFile } from "@/server/services/export-service";

import { getRequestContext, type RequestContext } from "./context";

/**
 * Serves a file the person downloads: always built for this request from the
 * current ledger, never cached, and saved under its own name.
 */
export async function download(
  build: (
    ctx: ServiceContext,
    request: Extract<RequestContext, { ok: true }>,
  ) => Promise<ExportFile>,
): Promise<Response> {
  const request = await getRequestContext();
  if (!request.ok) {
    return new Response("FinPilot is not set up yet, so there is nothing to download.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
  const file = await build(request.ctx, request);
  return new Response(file.body, {
    headers: {
      "Content-Type": file.contentType,
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
