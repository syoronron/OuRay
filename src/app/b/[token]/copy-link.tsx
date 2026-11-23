"use client";

import { useState } from "react";

/** このページの URL をコピーする（あとで進み具合を見るため） */
export function CopyLink() {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(window.location.href.replace(/\?.*$/, ""));
          setCopied(true);
        } catch {
          setCopied(false);
        }
      }}
      className="min-h-11 rounded-[10px] border border-mist bg-white px-4 text-sm font-bold text-navy"
    >
      {copied ? "コピーしました" : "このページのURLをコピー"}
    </button>
  );
}
