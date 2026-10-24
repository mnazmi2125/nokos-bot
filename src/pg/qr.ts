import QRCode from "qrcode";
import { InputFile } from "grammy";
import type { PgInvoice } from "./types.js";

export type QrPhoto = string | InputFile;

export async function qrPhotoSource(inv: PgInvoice): Promise<QrPhoto | null> {
  if (inv.qrString) {
    try {
      const buf = await QRCode.toBuffer(inv.qrString, { type: "png", width: 480, margin: 1 });
      return new InputFile(buf, "qris.png");
    } catch {}
  }
  if (inv.qrImageUrl) return inv.qrImageUrl;
  return null;
}
