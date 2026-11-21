// Photo proofs: shrunk on the phone before upload, so a proof is ~100-250 KB
// instead of a 4 MB camera photo.
import { supabase, isConfigured } from "./supabase.js";
import { addUsage } from "./usage.js";

export async function shrinkImage(file, maxSide, quality) {
  const bitmap = await createImageBitmap(file).catch(() => null);
  const src = bitmap || (await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("That file isn't a photo"));
    img.src = URL.createObjectURL(file);
  }));
  const w = src.width, h = src.height;
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext("2d").drawImage(src, 0, 0, canvas.width, canvas.height);
  bitmap?.close?.();
  return canvas;
}

/** -> { url, bytes } */
export async function uploadProof(room, file) {
  if (!isConfigured) {
    // demo mode: a small photo kept in this browser
    const canvas = await shrinkImage(file, 480, 0.6);
    const url = canvas.toDataURL("image/jpeg", 0.6);
    return { url, bytes: Math.round(url.length * 0.75) };
  }
  const canvas = await shrinkImage(file, 1280, 0.72);
  const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.72));
  const path = `${room}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("proofs").upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" });
  if (error) throw new Error(error.message);
  addUsage("photo", blob.size);
  return { url: supabase.storage.from("proofs").getPublicUrl(path).data.publicUrl, bytes: blob.size };
}

/** opens the phone's picker (gallery or camera, the person chooses); resolves with a File or null */
export function pickPhoto() {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.onchange = () => resolve(input.files?.[0] || null);
    input.oncancel = () => resolve(null);
    input.click();
  });
}
