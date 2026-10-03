import Tesseract from '../node_modules/tesseract.js/dist/tesseract.esm.min.js';
import { readShop } from './shop-reader.js';

const { createWorker } = Tesseract;
const PSM = { SINGLE_BLOCK: '6', SINGLE_LINE: '7' };

let workerPromise = null;

function getWorker() {
  workerPromise ??= createWorker('eng', 1, {
    workerPath: '/node_modules/tesseract.js/dist/worker.min.js',
    corePath: '/node_modules/tesseract.js-core',
    langPath: '/vendor/lang',
    gzip: false,
  });
  return workerPromise;
}

export async function imageToRgba(blob) {
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width; canvas.height = bmp.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bmp, 0, 0);
  return ctx.getImageData(0, 0, bmp.width, bmp.height);
}

function rgbaToCanvas(rgba) {
  const c = document.createElement('canvas');
  c.width = rgba.width; c.height = rgba.height;
  c.getContext('2d').putImageData(new ImageData(rgba.data, rgba.width, rgba.height), 0, 0);
  return c;
}

export async function readShopFromBlob(blob, onProgress = () => {}) {
  onProgress('Loading OCR engine…');
  const worker = await getWorker();
  const img = await imageToRgba(blob);
  let step = 0;
  const recognize = async (rgba, { digits, singleLine }) => {
    onProgress(`Reading shop… ${Math.round(Math.min(1, ++step / 22) * 100)}%`);
    await worker.setParameters({
      tessedit_pageseg_mode: singleLine ? PSM.SINGLE_LINE : PSM.SINGLE_BLOCK,
      tessedit_char_whitelist: digits ? '0123456789' : '',
    });
    const { data } = await worker.recognize(rgbaToCanvas(rgba));
    return data.text;
  };
  return readShop(img, recognize);
}
