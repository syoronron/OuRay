"use client";

import { useEffect, useRef, useState } from "react";

const MAX_SIDE = 1600;

/** 写真を長い辺 1600px の JPEG に縮小する（送る量を減らし、速く・確実に保存するため） */
async function shrink(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.8));
  if (!blob) throw new Error("画像を変換できませんでした");
  return new File([blob], "photo.jpg", { type: "image/jpeg" });
}

/**
 * 写真を撮る／選ぶ欄。スマホではカメラが開く。
 * 縮小した写真を、フォームの見えない欄（name）に入れて送る。
 */
export function PhotoInput({ name = "photo", label = "写真を撮る（任意）" }: { name?: string; label?: string }) {
  const hidden = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <div className="grid gap-2">
      <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-dashed border-navy bg-white px-4 text-sm font-bold text-navy">
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden>
          <rect x="2" y="5" width="16" height="12" rx="2" fill="none" stroke="#033b7d" strokeWidth="1.6" />
          <path d="M7 5l1.5-2h3L13 5" fill="none" stroke="#033b7d" strokeWidth="1.6" />
          <circle cx="10" cy="11" r="3.2" fill="none" stroke="#033b7d" strokeWidth="1.6" />
        </svg>
        {state === "busy" ? "写真を準備中…" : preview ? "撮り直す" : label}
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file || !hidden.current) return;
            setState("busy");
            try {
              const small = await shrink(file);
              const dt = new DataTransfer();
              dt.items.add(small);
              hidden.current.files = dt.files;
              setPreview(URL.createObjectURL(small));
              setState("idle");
            } catch {
              setState("error");
            }
          }}
        />
      </label>
      <input ref={hidden} type="file" name={name} className="hidden" tabIndex={-1} aria-hidden />
      {state === "error" && <p className="text-xs text-danger">写真を読み込めませんでした。別の写真を選んでください。</p>}
      {preview && (
        // 端末の中だけで見せるプレビュー（まだ保存していない）
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="撮った写真" className="h-28 w-fit rounded-[10px] object-cover" />
      )}
    </div>
  );
}
