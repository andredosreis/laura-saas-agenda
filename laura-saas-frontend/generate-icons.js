import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createCanvas } from 'canvas';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function generateIcons() {
  const sizes = [192, 512];
  const backgroundColor = '#ffffff';
  const brandColor = '#6366f1';
  const textColor = '#ffffff';

  for (const size of sizes) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');

    // Fundo branco
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, size, size);

    // Círculo indigo
    ctx.fillStyle = brandColor;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Texto "L"
    ctx.fillStyle = textColor;
    ctx.font = `bold ${size * 0.6}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('L', size / 2, size / 2);

    // Salvar arquivo
    const buffer = canvas.toBuffer('image/png');
    const dir = path.join(__dirname, 'public', 'icons');
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(path.join(dir, `icon-${size}x${size}.png`), buffer);
    fs.writeFileSync(path.join(dir, `icon-maskable-${size}x${size}.png`), buffer);
    console.log(`✅ Gerado: icon-${size}x${size}.png`);
  }
}

generateIcons().catch(console.error);