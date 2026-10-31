import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { fileTypeFromBuffer } from "file-type";
import { db } from "@/db";
import { attachment, messageReport } from "@/db/schema";
import { ATTACHMENT_EXTENSIONS, MAX_ATTACHMENT_BYTES } from "@/lib/validation";
import { blobs, ensureBlobContainer } from "@/server/blob";
import { requireMember } from "@/server/conversations";
import type { SessionUser } from "@/server/http";
import { ApiError, badRequest, notFound } from "@/server/http";
import { sanitizeLine } from "@/server/sanitize";

// Extension -> the only MIME type we accept for it. The extension must match
// what the file's magic bytes say it is; SVG/HTML are never accepted (scriptable).
const ALLOWED: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  pdf: "application/pdf",
  txt: "text/plain",
};

const MULTIPART_OVERHEAD = 16 * 1024;

function extensionOf(name: string) {
  const match = /\.([a-z0-9]+)$/i.exec(name);
  return match?.[1].toLowerCase() ?? "";
}

function isPlainUtf8(bytes: Uint8Array) {
  if (bytes.includes(0)) {
    return false;
  }
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/** Throws a 400/413 unless the file is an allowed type, verified by content. */
export async function detectAllowedType(name: string, bytes: Uint8Array) {
  if (bytes.byteLength === 0) {
    throw badRequest("File is empty", "INVALID_FILE");
  }
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new ApiError(413, "FILE_TOO_LARGE", "Files are limited to 5 MB");
  }
  const ext = extensionOf(name);
  if (!ATTACHMENT_EXTENSIONS.includes(ext)) {
    throw badRequest(
      `Allowed: ${ATTACHMENT_EXTENSIONS.join(", ")}`,
      "FILE_TYPE_NOT_ALLOWED",
    );
  }
  const expected = ALLOWED[ext];
  const detected = await fileTypeFromBuffer(bytes);
  if (expected === "text/plain") {
    // Text has no magic bytes: must not look like any binary format.
    if (detected || !isPlainUtf8(bytes)) {
      throw badRequest(
        "File content doesn't match its extension",
        "FILE_TYPE_MISMATCH",
      );
    }
    return expected;
  }
  if (detected?.mime !== expected) {
    throw badRequest(
      "File content doesn't match its extension",
      "FILE_TYPE_MISMATCH",
    );
  }
  return expected;
}

export async function uploadAttachment(
  userId: string,
  conversationId: string,
  req: Request,
) {
  await requireMember(userId, conversationId);
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_ATTACHMENT_BYTES + MULTIPART_OVERHEAD) {
    throw new ApiError(413, "FILE_TOO_LARGE", "Files are limited to 5 MB");
  }
  const form = await req.formData().catch(() => {
    throw badRequest("Expected multipart form data");
  });
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw badRequest("Missing file");
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    throw new ApiError(413, "FILE_TOO_LARGE", "Files are limited to 5 MB");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = await detectAllowedType(file.name, bytes);

  const originalName =
    sanitizeLine(file.name).replaceAll(/[/\\]/g, "_").slice(0, 120) || "file";
  const blobName = randomUUID(); // never the user's file name
  await ensureBlobContainer();
  await blobs()
    .getBlockBlobClient(blobName)
    .uploadData(bytes, { blobHTTPHeaders: { blobContentType: mime } });

  const [row] = await db
    .insert(attachment)
    .values({
      uploaderId: userId,
      conversationId,
      blobName,
      originalName,
      mime,
      size: bytes.byteLength,
    })
    .returning();
  return { id: row.id, name: row.originalName, mime: row.mime, size: row.size };
}

/** Members of the conversation, or admins when the file is evidence in a report. */
async function canReadAttachment(
  me: SessionUser,
  row: { id: string; conversationId: string },
) {
  const isMember = await requireMember(me.id, row.conversationId).then(
    () => true,
    () => false,
  );
  if (isMember || me.role !== "admin") {
    return isMember;
  }
  const report = await db.query.messageReport.findFirst({
    where: and(
      eq(messageReport.conversationId, row.conversationId),
      sql`${messageReport.attachmentIds} @> ${JSON.stringify([row.id])}::jsonb`,
    ),
    columns: { id: true },
  });
  return Boolean(report);
}

export async function downloadAttachment(me: SessionUser, id: string) {
  const row = await db.query.attachment.findFirst({
    where: eq(attachment.id, id),
  });
  if (!row) {
    throw notFound("Attachment not found");
  }
  // Uploaders can preview their own pending uploads; otherwise it must be sent.
  if (!row.messageId && row.uploaderId !== me.id) {
    throw notFound("Attachment not found");
  }
  if (!(await canReadAttachment(me, row))) {
    throw notFound("Attachment not found");
  }

  // Files are at most 5 MB, so buffering is fine and keeps types simple.
  const content = await blobs().getBlobClient(row.blobName).downloadToBuffer();
  const inline = row.mime.startsWith("image/");
  const filename = encodeURIComponent(row.originalName);
  return new Response(new Uint8Array(content), {
    headers: {
      "Content-Type": row.mime,
      "Content-Length": String(row.size),
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename*=UTF-8''${filename}`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function storageUsedBytes() {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(${attachment.size}), 0)::bigint`,
    })
    .from(attachment);
  return Number(row.total);
}
