// Decode string EMVCo QRIS dari gambar (PNG/JPEG) — untuk mendapatkan
// GOPAY_QRIS_STATIC dari screenshot/foto QRIS statis merchant.
// Jalankan: node scripts/qris-decode.js path/ke/qris.png

import fs from "node:fs";
import path from "node:path";
import jsQR from "jsqr";
import { PNG } from "pngjs";
import jpeg from "jpeg-js";

const file = process.argv[2];
if (!file) {
  console.error("Pemakaian: node scripts/qris-decode.js <gambar.png|jpg>");
  process.exit(1);
}

const buf = fs.readFileSync(path.resolve(file));
let rgba, width, height;

const ext = path.extname(file).toLowerCase();
if (ext === ".png" || buf.slice(1, 4).toString() === "PNG") {
  const png = PNG.sync.read(buf);
  rgba = png.data;
  width = png.width;
  height = png.height;
} else if (ext === ".jpg" || ext === ".jpeg" || buf[0] === 0xff) {
  const img = jpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 512 });
  rgba = img.data;
  width = img.width;
  height = img.height;
} else {
  console.error("Format gambar tidak dikenal (butuh PNG atau JPEG).");
  process.exit(1);
}

const code = jsQR(new Uint8ClampedArray(rgba.buffer, rgba.byteOffset, rgba.byteLength), width, height);
if (!code || !code.data) {
  console.error("QR tidak terbaca — gunakan gambar lebih tajam / resolusi lebih tinggi.");
  process.exit(1);
}

const payload = code.data.trim();
console.log(payload);
if (!payload.startsWith("000201")) {
  console.error("⚠️  Payload bukan QRIS (tidak diawali 000201) — periksa gambar.");
  process.exit(1);
}
