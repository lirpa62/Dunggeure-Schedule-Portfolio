import { createHmac, createHash, randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const REGION = "auto";
const SERVICE = "s3";
const SUPABASE_PUBLIC_PREFIX = "/storage/v1/object/public/";
const DECORATION_IMAGE_MAX_SIZE = 960;

loadEnvFile(".env.local");
loadEnvFile(".env");

const isApply = process.argv.includes("--apply");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number.parseInt(limitArg.split("=")[1] ?? "", 10) : null;

const config = {
  supabaseUrl: requiredEnv("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseServiceRoleKey: requiredEnv("SUPABASE_SERVICE_ROLE_KEY"),
  r2AccountId: requiredEnv("R2_ACCOUNT_ID"),
  r2AccessKeyId: requiredEnv("R2_ACCESS_KEY_ID"),
  r2SecretAccessKey: requiredEnv("R2_SECRET_ACCESS_KEY"),
  r2BucketName: requiredEnv("R2_BUCKET_NAME"),
  r2PublicBaseUrl: requiredEnv("R2_PUBLIC_BASE_URL").replace(/\/+$/, ""),
};

const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey);

let scanned = 0;
let skipped = 0;
let migrated = 0;
let failed = 0;

console.log(
  isApply
    ? "R2 이미지 마이그레이션을 시작합니다."
    : "DRY RUN: 실제 업로드/DB 수정 없이 마이그레이션 대상만 확인합니다. 실제 실행은 --apply를 붙이세요.",
);

await migrateSchedules();
await migrateCalendarDecorations();
await migrateStickers();
await migrateUsers();

console.log("");
console.log("완료");
console.log(`- 확인: ${scanned}`);
console.log(`- 건너뜀: ${skipped}`);
console.log(`- 마이그레이션: ${migrated}`);
console.log(`- 실패: ${failed}`);

if (!isApply) {
  console.log("");
  console.log("실제 적용:");
  console.log("npm run migrate:images-to-r2 -- --apply");
}

function loadEnvFile(path) {
  if (!existsSync(path)) return;

  const content = readFileSync(path, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eqIndex = line.indexOf("=");
    if (eqIndex === -1) continue;

    const key = line.slice(0, eqIndex).trim();
    const rawValue = line.slice(eqIndex + 1).trim();
    if (!key || process.env[key]) continue;

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  }
}

function requiredEnv(key) {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`${key} 환경변수가 필요합니다.`);
  }
  return value;
}

async function migrateSchedules() {
  const { data, error } = await supabase
    .from("schedules")
    .select("id, image_url")
    .not("image_url", "is", null)
    .order("created_at", { ascending: true });

  if (error) throw error;

  await processRows("schedules.image_url", data ?? [], async (row) => {
    if (!row.image_url || isR2Url(row.image_url)) return "skip";

    const sourcePath = getSupabaseObjectPath(row.image_url, "schedule-images");
    const targetPath =
      sourcePath && sourcePath.startsWith("schedules/")
        ? sourcePath
        : `schedules/migrated/${row.id}/${getFilename(row.image_url)}`;

    return migrateImage({
      label: `schedules:${row.id}`,
      sourceUrl: row.image_url,
      targetPath,
      update: () =>
        supabase
          .from("schedules")
          .update({ image_url: getR2PublicUrl(targetPath) })
          .eq("id", row.id),
    });
  });
}

async function migrateStickers() {
  const { data, error } = await supabase
    .from("stickers")
    .select("id, url, storage_path")
    .not("url", "is", null)
    .order("created_at", { ascending: true });

  if (error) throw error;

  await processRows("stickers.url/storage_path", data ?? [], async (row) => {
    if (!row.url || isR2Url(row.url)) return "skip";

    const sourcePath =
      row.storage_path || getSupabaseObjectPath(row.url, "stickers") || `migrated/${row.id}/${getFilename(row.url)}`;
    const targetPath = sourcePath.startsWith("stickers/")
      ? sourcePath
      : `stickers/${sourcePath}`;

    return migrateImage({
      label: `stickers:${row.id}`,
      sourceUrl: row.url,
      targetPath,
      update: () =>
        supabase
          .from("stickers")
          .update({
            url: getR2PublicUrl(targetPath),
            storage_path: targetPath,
          })
          .eq("id", row.id),
    });
  });
}

async function migrateCalendarDecorations() {
  const { data, error } = await supabase
    .from("calendar_decorations")
    .select("id, image_url, storage_path, original_image_url, original_storage_path")
    .not("image_url", "is", null)
    .order("created_at", { ascending: true });

  if (error) throw error;

  await processRows("calendar_decorations.image_url/storage_path", data ?? [], async (row) => {
    if (
      !row.image_url ||
      (isR2Url(row.image_url) &&
        row.original_image_url &&
        row.original_storage_path &&
        (row.storage_path?.endsWith(".webp") || row.storage_path === row.original_storage_path))
    ) {
      return "skip";
    }

    const sourcePath =
      row.storage_path ||
      getSupabaseObjectPath(row.image_url, "schedule-images") ||
      `decorations/migrated/${row.id}/${getFilename(row.image_url)}`;
    const basePath = sourcePath.startsWith("decorations/")
      ? sourcePath
      : `decorations/${sourcePath}`;

    return migrateDecorationImage({
      label: `calendar_decorations:${row.id}`,
      sourceUrl: row.image_url,
      sourcePath: basePath,
      update: (payload) =>
        supabase
          .from("calendar_decorations")
          .update(payload)
          .eq("id", row.id),
    });
  });
}

async function migrateUsers() {
  const { data, error } = await supabase
    .from("users")
    .select("id, avatar_url, avatar_path")
    .not("avatar_url", "is", null)
    .order("created_at", { ascending: true });

  if (error) throw error;

  await processRows("users.avatar_url/avatar_path", data ?? [], async (row) => {
    if (!row.avatar_url || isR2Url(row.avatar_url)) return "skip";

    const targetPath =
      row.avatar_path ||
      getSupabaseObjectPath(row.avatar_url, "schedule-images") ||
      `avatars/migrated/${row.id}/${getFilename(row.avatar_url)}`;

    return migrateImage({
      label: `users:${row.id}`,
      sourceUrl: row.avatar_url,
      targetPath,
      update: () =>
        supabase
          .from("users")
          .update({
            avatar_url: getR2PublicUrl(targetPath),
            avatar_path: targetPath,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id),
    });
  });
}

async function processRows(name, rows, handler) {
  console.log("");
  console.log(`[${name}] ${rows.length}개 확인`);

  let processed = 0;
  for (const row of rows) {
    if (Number.isFinite(limit) && processed >= limit) break;
    processed += 1;
    scanned += 1;

    try {
      const result = await handler(row);
      if (result === "skip") skipped += 1;
    } catch (error) {
      failed += 1;
      console.error(`실패: ${error.message}`);
    }
  }
}

async function migrateImage({ label, sourceUrl, targetPath, update }) {
  const targetUrl = getR2PublicUrl(targetPath);

  if (!isApply) {
    console.log(`${label}: ${targetPath}`);
    return "dry-run";
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`${label} 다운로드 실패 (${response.status})`);
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const buffer = Buffer.from(await response.arrayBuffer());

  await uploadR2Object(targetPath, buffer, {
    contentType,
    cacheControl: "31536000",
  });

  const { error } = await update();
  if (error) throw error;

  migrated += 1;
  console.log(`${label}: ${targetUrl}`);
  return "migrated";
}

async function migrateDecorationImage({ label, sourceUrl, sourcePath, update }) {
  const originalPath = sourcePath.includes("/originals/")
    ? sourcePath
    : insertOriginalsFolder(sourcePath);
  const webpPath = replaceExtension(removeOriginalsFolder(sourcePath), "webp");

  if (!isApply) {
    console.log(`${label}: original=${originalPath}, display=${webpPath}`);
    return "dry-run";
  }

  const response = await fetch(sourceUrl);
  if (!response.ok) {
    throw new Error(`${label} 다운로드 실패 (${response.status})`);
  }

  const contentType = response.headers.get("content-type") || "application/octet-stream";
  const buffer = Buffer.from(await response.arrayBuffer());
  const canConvert = ["image/jpeg", "image/png", "image/webp"].includes(contentType);

  await uploadR2Object(originalPath, buffer, {
    contentType,
    cacheControl: "31536000",
  });

  let displayPath = originalPath;
  let displayUrl = getR2PublicUrl(originalPath);

  if (canConvert) {
    const webp = await sharp(buffer)
      .rotate()
      .resize({
        width: DECORATION_IMAGE_MAX_SIZE,
        height: DECORATION_IMAGE_MAX_SIZE,
        fit: "inside",
        withoutEnlargement: true,
      })
      .webp({ quality: 82, effort: 4 })
      .toBuffer();
    await uploadR2Object(webpPath, webp, {
      contentType: "image/webp",
      cacheControl: "31536000",
    });
    displayPath = webpPath;
    displayUrl = getR2PublicUrl(webpPath);
  }

  const { error } = await update({
    image_url: displayUrl,
    storage_path: displayPath,
    original_image_url: getR2PublicUrl(originalPath),
    original_storage_path: originalPath,
  });
  if (error) throw error;

  migrated += 1;
  console.log(`${label}: ${displayUrl}`);
  return "migrated";
}

function isR2Url(url) {
  return url.startsWith(`${config.r2PublicBaseUrl}/`);
}

function getR2PublicUrl(path) {
  return `${config.r2PublicBaseUrl}/${encodeObjectPath(path)}`;
}

function getSupabaseObjectPath(url, bucket) {
  try {
    const { pathname } = new URL(url);
    const marker = `${SUPABASE_PUBLIC_PREFIX}${bucket}/`;
    const index = pathname.indexOf(marker);
    if (index === -1) return null;
    return decodeURIComponent(pathname.slice(index + marker.length));
  } catch {
    return null;
  }
}

function getFilename(url) {
  try {
    const { pathname } = new URL(url);
    const filename = decodeURIComponent(pathname.split("/").filter(Boolean).pop() || "");
    if (filename) return filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  } catch {
    // Fallback below.
  }
  return `${Date.now()}-${randomUUID()}.bin`;
}

async function uploadR2Object(path, body, options) {
  const encodedPath = encodeObjectPath(path);
  const now = new Date();
  const amzDate = getAmzDate(now);
  const dateStamp = getDateStamp(now);
  const payloadHash = hashHex(body);
  const host = `${config.r2AccountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${config.r2BucketName}/${encodedPath}`;
  const headers = {
    "cache-control": options.cacheControl,
    "content-type": options.contentType,
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    hashHex(canonicalRequest),
  ].join("\n");
  const signature = createHmac("sha256", getSigningKey(config.r2SecretAccessKey, dateStamp))
    .update(stringToSign)
    .digest("hex");

  const response = await fetch(`https://${host}${canonicalUri}`, {
    method: "PUT",
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${config.r2AccessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: new Uint8Array(body),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `R2 업로드 실패 (${response.status})`);
  }
}

function insertOriginalsFolder(path) {
  const parts = path.split("/");
  const filename = parts.pop();
  return [...parts, "originals", filename].filter(Boolean).join("/");
}

function removeOriginalsFolder(path) {
  return path.replace("/originals/", "/");
}

function replaceExtension(path, nextExtension) {
  return path.replace(/\.[^/.]+$/, `.${nextExtension}`);
}

function encodeObjectPath(path) {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function hmac(key, value) {
  return createHmac("sha256", key).update(value).digest();
}

function getSigningKey(secretAccessKey, dateStamp) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

function hashHex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function getAmzDate(date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function getDateStamp(date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}
