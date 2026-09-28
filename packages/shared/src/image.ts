// Product image guardrails — Render Postgres stores photos inline as
// base64 TEXT (no data: prefix). Without limits a single 12MP phone photo
// (~3MB base64) dwarfs every other column and slows catalog sync, so all
// upload paths must funnel through fileToBase64Limited().

export const MAX_PRODUCT_IMAGE_DIM = 800;
export const MAX_PRODUCT_IMAGE_BYTES = 500 * 1024; // binary bytes
// Base64 inflates ~4/3; DB CHECK allows 700k chars ≈ 525KB binary.
export const MAX_PRODUCT_IMAGE_B64_CHARS = 700000;

export function isImageSizeOk(b64: string): boolean {
  return b64.length <= MAX_PRODUCT_IMAGE_B64_CHARS;
}

// True when a product insert/update failed only because the database has
// no products.image column yet (migration 0021 never applied). Callers use
// this to retry the write WITHOUT the photo instead of losing the product.
export function isMissingImageColumnError(msg: string): boolean {
  return /image/i.test(msg) && /column|schema cache|no such|unknown|does not exist/i.test(msg);
}

export function fileToBase64Limited(
  file: File,
  maxDim = MAX_PRODUCT_IMAGE_DIM,
  quality = 0.8,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > 8 * 1024 * 1024) {
      reject(new Error('Photo too large (max 8MB). Pick a smaller file.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          let w = img.width;
          let h = img.height;
          if (w > maxDim || h > maxDim) {
            if (w > h) { h = Math.round((h * maxDim) / w); w = maxDim; }
            else { w = Math.round((w * maxDim) / h); h = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = w;
          canvas.height = h;
          canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
          const b64 = canvas.toDataURL('image/jpeg', quality).split(',')[1] || '';
          if (!isImageSizeOk(b64)) {
            // One retry at lower quality before giving up.
            const small = canvas.toDataURL('image/jpeg', 0.6).split(',')[1] || '';
            if (!isImageSizeOk(small)) {
              reject(new Error('Photo still too large after compression. Use a smaller image.'));
              return;
            }
            resolve(small);
            return;
          }
          resolve(b64);
        } catch (e) {
          reject(e);
        }
      };
      img.onerror = () => reject(new Error('Could not read that image file.'));
      img.src = reader.result as string;
    };
    reader.onerror = () => reject(new Error('Could not read that image file.'));
    reader.readAsDataURL(file);
  });
}
