import QRCode from "qrcode";

export async function generateQRCode(url: string): Promise<string> {
  try {
    const dataURL = await QRCode.toDataURL(url);
    return dataURL;
  } catch (error) {
    console.error("Error generating QR code:", error);
    throw error;
  }
}