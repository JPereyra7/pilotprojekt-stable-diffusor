/**
 * Tar ett rug‑foto (antagligen JPG med vit bakgrund)
 * och returnerar en base64‑PNG med transparent bakgrund
 *   – utan externa API:er (enkelt k‑means‑hack).
 */
export async function removeBackground(dataUrl: string): Promise<string> {
  // ladda in i off‑screen canvas
  const img = await createImageBitmap(await fetch(dataUrl).then(r => r.blob()));
  const cvs = new OffscreenCanvas(img.width, img.height);
  const ctx = cvs.getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const imgData = ctx.getImageData(0, 0, img.width, img.height);
  const d = imgData.data;

  // räkna vithet; alpha‑kana 0 om nästan vit
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i], g = d[i+1], b = d[i+2];
    if (r > 240 && g > 240 && b > 240) d[i+3] = 0; // transparent
  }
  ctx.putImageData(imgData, 0, 0);

  return cvs.convertToBlob({ type:"image/png" })
           .then(b => new Promise<string>(res=>{
             const fr = new FileReader();
             fr.onload = () => res(fr.result as string);
             fr.readAsDataURL(b);
           }));
}
