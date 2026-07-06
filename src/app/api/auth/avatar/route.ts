import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase-admin";
import { requireUser } from "@/lib/auth";
import { canConvertToWebp, convertImageToWebp } from "@/lib/image-optimization";
import { deleteR2Object, isR2Configured, uploadR2Buffer, uploadR2Object } from "@/lib/r2-storage";

const BUCKET = "schedule-images";
const MAX_BYTES = 3 * 1024 * 1024;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const AVATAR_IMAGE_MAX_SIZE = 512;

export const runtime = "nodejs";

function extensionFor(file: File) {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]+$/.test(fromName)) return fromName;
  return file.type.split("/").pop() || "bin";
}

export async function POST(req: NextRequest) {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const form = await req.formData();
  const file = form.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "파일이 누락되었습니다." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "지원하지 않는 파일 형식입니다. (jpeg, png, webp, gif)" },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "파일이 3MB를 초과합니다." }, { status: 400 });
  }

  const supabase = createAdminClient();
  const { data: current } = await supabase
    .from("users")
    .select("avatar_path")
    .eq("id", auth.id)
    .maybeSingle();

  const shouldConvert = canConvertToWebp(file);
  const ext = shouldConvert ? "webp" : extensionFor(file);
  const path = `avatars/${auth.id}/${Date.now()}-${crypto.randomUUID()}.${ext}`;
  let publicUrl: string;
  const webp = shouldConvert
    ? await convertImageToWebp(file, {
        maxWidth: AVATAR_IMAGE_MAX_SIZE,
        maxHeight: AVATAR_IMAGE_MAX_SIZE,
      })
    : null;

  if (isR2Configured()) {
    const uploaded = webp
      ? await uploadR2Buffer(path, webp.buffer, {
          contentType: webp.contentType,
          cacheControl: "31536000",
        })
      : await uploadR2Object(path, file, {
          contentType: file.type,
          cacheControl: "31536000",
        });
    publicUrl = uploaded.url;
  } else {
    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, webp?.buffer ?? file, {
      contentType: webp?.contentType ?? file.type,
      cacheControl: "31536000",
    });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    publicUrl = data.publicUrl;
  }

  const { data: user, error: updateError } = await supabase
    .from("users")
    .update({
      avatar_url: publicUrl,
      avatar_path: path,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.id)
    .select("id, username, nickname, avatar_url, role, must_change_password, created_at")
    .single();

  if (updateError) {
    await deleteR2Object(path);
    await supabase.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: "프로필 이미지를 저장하지 못했습니다." }, { status: 500 });
  }

  if (current?.avatar_path) {
    await deleteR2Object(current.avatar_path);
    await supabase.storage.from(BUCKET).remove([current.avatar_path]);
  }

  return NextResponse.json({ user });
}

export async function DELETE() {
  const auth = await requireUser();
  if (auth instanceof NextResponse) return auth;

  const supabase = createAdminClient();
  const { data: current } = await supabase
    .from("users")
    .select("avatar_path")
    .eq("id", auth.id)
    .maybeSingle();

  const { data: user, error } = await supabase
    .from("users")
    .update({
      avatar_url: null,
      avatar_path: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", auth.id)
    .select("id, username, nickname, avatar_url, role, must_change_password, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "프로필 이미지를 삭제하지 못했습니다." }, { status: 500 });
  }

  if (current?.avatar_path) {
    await deleteR2Object(current.avatar_path);
    await supabase.storage.from(BUCKET).remove([current.avatar_path]);
  }

  return NextResponse.json({ user });
}
