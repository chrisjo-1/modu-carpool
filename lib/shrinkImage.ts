/** 사진을 가로 최대 1200px JPEG로 줄인다(1MB 넘으면 품질을 낮춰 다시). GIF는 움직임을 지키려 그대로 올린다. */
export async function shrinkImage(file: File): Promise<Blob> {
  if (file.type === "image/gif") return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = () => rej(new Error("decode"));
      el.src = url;
    });
    let w = Math.min(1200, img.naturalWidth || 1200);
    let q = 0.85;
    for (let i = 0; i < 5; i++) {
      const h = Math.round(((img.naturalHeight || w) * w) / (img.naturalWidth || w));
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      const ctx = c.getContext("2d");
      if (!ctx) throw new Error("canvas");
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(img, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", q));
      if (blob && blob.size <= 950_000) return blob;
      w = Math.round(w * 0.8);
      q = Math.max(0.5, q - 0.1);
    }
    throw new Error("too large");
  } finally {
    URL.revokeObjectURL(url);
  }
}
