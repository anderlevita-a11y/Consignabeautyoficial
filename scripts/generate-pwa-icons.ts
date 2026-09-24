import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const inputFile = './src/assets/images/app_favicon_1787915939764.jpg';
const outputDir = './public';

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir);
}

async function generateIcons() {
  try {
    await sharp(inputFile)
      .resize(192, 192)
      .png()
      .toFile(path.join(outputDir, 'pwa-192x192.png'));

    await sharp(inputFile)
      .resize(512, 512)
      .png()
      .toFile(path.join(outputDir, 'pwa-512x512.png'));

    await sharp(inputFile)
      .resize(180, 180)
      .png()
      .toFile(path.join(outputDir, 'apple-touch-icon.png'));

    console.log('Icons generated successfully');
  } catch (err) {
    console.error('Error generating icons:', err);
  }
}

generateIcons();
