// Daftar layanan populer (top list) — dikunci PER PROVIDER.
// Key = nama provider; nanti provider lain tinggal tambah key sendiri
// tanpa mengubah logika (mis. "providerlain": ["whatsapp", ...]).
export const TOP_SERVICES: Record<string, string[]> = {
  smscodegg: [
    "whatsapp",
    "facebook",
    "michat",
    "telegram",
    "instagram",
    "threads",
    "tiktok",
    "twitter",
    "spotify",
    "netflix",
    "shopee",
    "lazada",
    "tokopedia",
    "grab",
    "gojek",
    "discord",
    "google",
    "youtube",
    "gmail",
    "zoom",
  ],
};

// Provider yang sedang dipakai bot saat ini (catalog smscode.gg).
export const CURRENT_PROVIDER = "smscodegg";

/**
 * Susun daftar layanan: blok 🔥 TOP dulu (urut sesuai config),
 * sisanya A–Z. Cocok nama memakai "contains" huruf kecil
 * (contoh: "WhatsApp Business", "YouTube Music" ikut top).
 */
export function orderServiceList<T extends { name: string }>(
  list: T[],
  provider: string = CURRENT_PROVIDER
): T[] {
  const top = TOP_SERVICES[provider];
  if (!top || top.length === 0) {
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }
  const rank = (name: string): number => {
    const k = name.toLowerCase();
    for (let i = 0; i < top.length; i++) if (k.includes(top[i])) return i;
    return -1;
  };
  const hot: T[] = [];
  const rest: T[] = [];
  for (const s of list) (rank(s.name) >= 0 ? hot : rest).push(s);
  hot.sort((a, b) => rank(a.name) - rank(b.name));
  rest.sort((a, b) => a.name.localeCompare(b.name));
  return [...hot, ...rest];
}
