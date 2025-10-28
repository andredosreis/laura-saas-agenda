import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas } from 'canvas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateIcons() {
  // Android sizes
  const androidSizes = [192, 512];
  // iOS sizes
  const iosSizes = [180, 167, 152];
  
  const backgroundColor = '#ffffff';
  const brandColor = '#6366f1';
  const textColor = '#ffffff';

  // Gerar ícones Android (com maskable)
  for (const size of androidSizes) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = brandColor;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = textColor;
    ctx.font = `bold ${size * 0.6}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('L', size / 2, size / 2);

    const buffer = canvas.toBuffer('image/png');
    const dir = path.join(__dirname, 'public');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(path.join(dir, `icon-${size}x${size}.png`), buffer);
    fs.writeFileSync(path.join(dir, `icon-maskable-${size}x${size}.png`), buffer);
    console.log(`✅ Android: icon-${size}x${size}.png`);
  }

  // Gerar ícones iOS (sem maskable, com rounded corners)
  for (const size of iosSizes) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, size, size);

    ctx.fillStyle = brandColor;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = textColor;
    ctx.font = `bold ${size * 0.6}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('L', size / 2, size / 2);

    const buffer = canvas.toBuffer('image/png');
    const dir = path.join(__dirname, 'public');
    
    if (size === 180) {
      fs.writeFileSync(path.join(dir, `apple-touch-icon.png`), buffer);
      console.log(`✅ iOS: apple-touch-icon.png (180x180)`);
    } else {
      fs.writeFileSync(path.join(dir, `apple-touch-icon-${size}x${size}.png`), buffer);
      console.log(`✅ iOS: apple-touch-icon-${size}x${size}.png`);
    }
  }
}

generateIcons().catch(console.error);