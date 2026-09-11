/** Template camera angle: disisipkan natural ke prompt (", angle") oleh worker. */

export interface CameraAngleTemplate {
  slug: string;
  display_name: string;
  angle_en: string;
}

/**
 * Gabung prompt + angle secara natural (koma).
 * Bila maxLen diisi (mis. batas textarea 500), prompt dipotong agar angle
 * tetap utuh di akhir. Tanpa maxLen = join murni (untuk worker: prompt
 * provider tidak kena batas UX, jadi prompt user tidak boleh dipotong).
 * Bila prompt sudah mengandung angle (case-insensitive) → kembalikan utuh
 * (anti-duplikat: suggest sudah menyisipi angle ke textarea).
 */
export function appendCameraAngle(prompt: string, angleEn: string, maxLen?: number): string {
  const p = prompt.trim();
  const a = angleEn.trim();
  if (!a) return maxLen === undefined ? p : p.slice(0, maxLen);
  if (!p) return maxLen === undefined ? a : a.slice(0, maxLen);
  if (p.toLowerCase().includes(a.toLowerCase())) {
    return maxLen === undefined ? p : p.slice(0, maxLen);
  }
  const joined = `${p}, ${a}`;
  if (maxLen === undefined || joined.length <= maxLen) return joined;
  const room = maxLen - a.length - 2;
  if (room <= 0) return a.slice(0, maxLen);
  return `${p.slice(0, room).trimEnd()}, ${a}`;
}
