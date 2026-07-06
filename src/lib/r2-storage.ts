import { createHash, createHmac } from "crypto";

type UploadObjectOptions = {
  contentType: string;
  cacheControl?: string;
};

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicBaseUrl: string;
};

const REGION = "auto";
const SERVICE = "s3";

function getR2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucketName = process.env.R2_BUCKET_NAME?.trim();
  const publicBaseUrl = process.env.R2_PUBLIC_BASE_URL?.trim();

  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucketName ||
    !publicBaseUrl
  ) {
    return null;
  }

  return {
    accountId,
    accessKeyId,
    secretAccessKey,
    bucketName,
    publicBaseUrl: publicBaseUrl.replace(/\/+$/, ""),
  };
}

export function isR2Configured() {
  return Boolean(getR2Config());
}

function hmac(key: string | Buffer, value: string) {
  return createHmac("sha256", key).update(value).digest();
}

function getSigningKey(secretAccessKey: string, dateStamp: string) {
  const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, "aws4_request");
}

function hashHex(value: Buffer | string) {
  return createHash("sha256").update(value).digest("hex");
}

function encodeObjectPath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function getAmzDate(date: Date) {
  return date.toISOString().replace(/[:-]|\.\d{3}/g, "");
}

function getDateStamp(date: Date) {
  return date.toISOString().slice(0, 10).replace(/-/g, "");
}

async function requestR2Object(
  method: "PUT" | "DELETE",
  path: string,
  body?: Buffer,
  options?: UploadObjectOptions,
) {
  const config = getR2Config();
  if (!config) {
    throw new Error("R2 환경변수가 설정되지 않았습니다.");
  }

  const encodedPath = encodeObjectPath(path);
  const now = new Date();
  const amzDate = getAmzDate(now);
  const dateStamp = getDateStamp(now);
  const payloadHash = hashHex(body ?? "");
  const host = `${config.accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${config.bucketName}/${encodedPath}`;
  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };

  if (options?.contentType) headers["content-type"] = options.contentType;
  if (options?.cacheControl) headers["cache-control"] = options.cacheControl;

  const signedHeaderNames = Object.keys(headers).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");
  const signedHeaders = signedHeaderNames.join(";");
  const canonicalRequest = [
    method,
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
  const signature = createHmac(
    "sha256",
    getSigningKey(config.secretAccessKey, dateStamp),
  )
    .update(stringToSign)
    .digest("hex");

  const response = await fetch(`https://${host}${canonicalUri}`, {
    method,
    headers: {
      ...headers,
      Authorization: `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: body ? new Uint8Array(body) : undefined,
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || `R2 요청에 실패했습니다. (${response.status})`);
  }
}

export function getR2PublicUrl(path: string) {
  const config = getR2Config();
  if (!config) {
    throw new Error("R2 환경변수가 설정되지 않았습니다.");
  }
  return `${config.publicBaseUrl}/${encodeObjectPath(path)}`;
}

export async function uploadR2Object(
  path: string,
  file: File,
  options: UploadObjectOptions,
) {
  const buffer = Buffer.from(await file.arrayBuffer());
  return uploadR2Buffer(path, buffer, options);
}

export async function uploadR2Buffer(
  path: string,
  buffer: Buffer,
  options: UploadObjectOptions,
) {
  await requestR2Object("PUT", path, buffer, options);
  return { path, url: getR2PublicUrl(path) };
}

export async function deleteR2Object(path: string | null | undefined) {
  if (!path || !isR2Configured()) return;
  await requestR2Object("DELETE", path).catch(() => {
    // Storage cleanup is best-effort; DB state should not fail because of it.
  });
}
