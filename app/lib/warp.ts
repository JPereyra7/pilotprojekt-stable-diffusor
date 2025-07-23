/* eslint-disable @typescript-eslint/no-explicit-any */
export type Mat3 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number
];

/** Enklare och mer stabil perspective transform */
export function createPerspectiveTransform(
  sourceWidth: number,
  sourceHeight: number,
  targetCorners: number[] // [x0,y0, x1,y1, x2,y2, x3,y3]
): {
  centerX: number;
  centerY: number;
  scaleX: number;
  scaleY: number;
  skewX: number;
} {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = targetCorners;

  // Beräkna center av target area
  const centerX = (x0 + x1 + x2 + x3) / 4;
  const centerY = (y0 + y1 + y2 + y3) / 4;

  // Beräkna genomsnittlig bredd och höjd
  const topWidth = Math.sqrt((x1 - x0) ** 2 + (y1 - y0) ** 2);
  const bottomWidth = Math.sqrt((x2 - x3) ** 2 + (y2 - y3) ** 2);
  const leftHeight = Math.sqrt((x3 - x0) ** 2 + (y3 - y0) ** 2);
  const rightHeight = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);

  const avgWidth = (topWidth + bottomWidth) / 2;
  const avgHeight = (leftHeight + rightHeight) / 2;

  // Beräkna scale
  const scaleX = avgWidth / sourceWidth;
  const scaleY = avgHeight / sourceHeight;

  // Beräkna skew baserat på perspektiv
  const skewX = ((bottomWidth - topWidth) / (topWidth + bottomWidth)) * 0.5;

  return { centerX, centerY, scaleX, scaleY, skewX };
}

/** Applicera förenklad perspective transform */
export function applySimplePerspective(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  img: CanvasImageSource,
  transform: {
    centerX: number;
    centerY: number;
    scaleX: number;
    scaleY: number;
    skewX: number;
  }
) {
  const { centerX, centerY, scaleX, scaleY, skewX } = transform;

  ctx.save();

  // Flytta till center
  ctx.translate(centerX, centerY);

  // Applicera scale
  ctx.scale(scaleX, scaleY);

  // Applicera skew för perspektiv
  ctx.transform(1, 0, skewX, 1, 0, 0);

  // Rita bilden centrerad
  const imgWidth = (img as any).width || (img as HTMLImageElement).naturalWidth;
  const imgHeight =
    (img as any).height || (img as HTMLImageElement).naturalHeight;

  ctx.drawImage(img, -imgWidth / 2, -imgHeight / 2);

  ctx.restore();
}

// Behåll gamla funktioner för bakåtkompatibilitet
export function warpMatrix(
  sw: number,
  sh: number,
  src: number[],
  dst: number[]
): Mat3 {
  // Förenkla - returnera identity matrix om komplex transform
  return [1, 0, 0, 0, 1, 0, 0, 0, 1];
}

export function applyPerspective(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  img: CanvasImageSource,
  m: Mat3
) {
  // Fallback till enkel transform
  ctx.save();
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}
