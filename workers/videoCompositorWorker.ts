/**
 * Video Compositor Worker (OffscreenCanvas)
 * ==========================================
 * Recibe ImageBitmap de la imagen original y la máscara de segmentación,
 * compone el resultado final (blur / imagen de fondo) en un OffscreenCanvas
 * interno y devuelve el resultado como ImageBitmap transferible.
 *
 * Mensajes entrantes:
 *   { type: 'init', width: number, height: number }
 *   { type: 'config', effectType, blurAmount, mirrorVideo, backgroundImageBlob? }
 *   { type: 'frame', image: ImageBitmap, mask: ImageBitmap }
 *   { type: 'destroy' }
 *
 * Mensajes salientes:
 *   { type: 'ready' }
 *   { type: 'composited', bitmap: ImageBitmap }  (transferable)
 */

let canvas: OffscreenCanvas | null = null;
let ctx: OffscreenCanvasRenderingContext2D | null = null;
let effectType: 'none' | 'blur' | 'image' = 'none';
let blurAmount = 10;
let mirrorVideo = false;
let backgroundBitmap: ImageBitmap | null = null;

function post(msg: any, transfer?: Transferable[]) {
  (self as unknown as Worker).postMessage(msg, { transfer: transfer ?? [] });
}

self.onmessage = async (e: MessageEvent) => {
  const { type } = e.data;

  switch (type) {
    case 'init': {
      const w = e.data.width || 640;
      const h = e.data.height || 480;
      canvas = new OffscreenCanvas(w, h);
      ctx = canvas.getContext('2d');
      post({ type: 'ready' });
      break;
    }

    case 'resize': {
      if (canvas) {
        canvas.width = e.data.width || canvas.width;
        canvas.height = e.data.height || canvas.height;
      }
      break;
    }

    case 'config': {
      effectType = e.data.effectType ?? effectType;
      blurAmount = e.data.blurAmount ?? blurAmount;
      mirrorVideo = e.data.mirrorVideo ?? mirrorVideo;

      if (e.data.backgroundImageBlob) {
        try {
          backgroundBitmap = await createImageBitmap(e.data.backgroundImageBlob as Blob);
        } catch {
          backgroundBitmap = null;
        }
      } else if (e.data.clearBackground) {
        backgroundBitmap = null;
      }
      break;
    }

    case 'frame': {
      if (!canvas || !ctx) break;

      const image = e.data.image as ImageBitmap;
      const mask = e.data.mask as ImageBitmap;
      const w = canvas.width;
      const h = canvas.height;

      ctx.save();
      ctx.clearRect(0, 0, w, h);

      if (mirrorVideo) {
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
      }

      if (effectType === 'blur') {
        ctx.filter = `blur(${blurAmount}px)`;
        ctx.drawImage(image, 0, 0, w, h);
        ctx.filter = 'none';

        ctx.globalCompositeOperation = 'destination-out';
        ctx.drawImage(mask, 0, 0, w, h);
        ctx.globalCompositeOperation = 'destination-over';
        ctx.drawImage(image, 0, 0, w, h);
      } else if (effectType === 'image' && backgroundBitmap) {
        ctx.drawImage(mask, 0, 0, w, h);
        ctx.globalCompositeOperation = 'source-in';
        ctx.drawImage(image, 0, 0, w, h);
        ctx.globalCompositeOperation = 'destination-over';
        if (mirrorVideo) {
          ctx.scale(-1, 1);
          ctx.translate(-w, 0);
        }
        ctx.drawImage(backgroundBitmap, 0, 0, w, h);
      } else {
        ctx.drawImage(image, 0, 0, w, h);
      }

      ctx.restore();

      image.close();
      mask.close();

      const bitmap = canvas.transferToImageBitmap();
      post({ type: 'composited', bitmap }, [bitmap]);
      break;
    }

    case 'destroy': {
      backgroundBitmap?.close();
      backgroundBitmap = null;
      canvas = null;
      ctx = null;
      break;
    }
  }
};
