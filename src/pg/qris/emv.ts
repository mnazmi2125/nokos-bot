// QRIS dinamis (EMVCo TLV): menyisipkan nominal ke QRIS statis merchant.
// Metode: strip CRC lama → ubah titik-inisiasi 010211 (statis) → 010212 (dinamis)
// → sisip tag 54 (Amount) sebelum tag 58 (IDR) → hitung ulang CRC16-CCITT.

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) → 4 hex uppercase. */
function crc16ccitt(data: string): string {
  let crc = 0xffff;
  for (let i = 0; i < data.length; i++) {
    crc ^= data.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Bangun payload QRIS dinamis dari string QRIS statis + nominal (Rupiah utuh).
 * @throws Error bila string bukan QRIS valid (tidak ada tag 58 "ID").
 */
export function buildDynamicQris(staticQris: string, amount: number): string {
  const raw = staticQris.trim();
  if (!raw || !raw.startsWith("000201")) {
    throw new Error("String QRIS kosong atau bukan payload QRIS (harus diawali 000201).");
  }
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Nominal QRIS harus bilangan bulat positif.");
  }
  // Buang CRC lama (payload berakhiran 6304 + 4 digit CRC)
  const data = raw.endsWith("6304") ? raw : raw.slice(0, -4);
  const step1 = data.replace("010211", "010212");
  if (!step1.includes("5802ID")) {
    throw new Error("Format QRIS tidak valid — periksa GOPAY_QRIS_STATIC.");
  }
  const [before, after] = step1.split("5802ID");
  const nominalField =
    "54" + String(amount.toString().length).padStart(2, "0") + amount;
  const body = before + nominalField + "5802ID" + after;
  return body + crc16ccitt(body);
}

export { crc16ccitt };
