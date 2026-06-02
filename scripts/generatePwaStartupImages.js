const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const publicDir = path.join(root, 'public');
const indexHtml = fs.readFileSync(path.join(publicDir, 'index.html'), 'utf8');
const logo = PNG.sync.read(fs.readFileSync(path.join(publicDir, 'beerva-logo-transparent.png')));

const BACKGROUND = { red: 0x0d, green: 0x12, blue: 0x1a };
const LOGO_WIDTH_CSS_PX = 96;
const LOGO_CENTER_Y_OFFSET_CSS_PX = -32;
const ANY_ICON_LOGO_SCALE = 0.7;
const MASKABLE_ICON_LOGO_SCALE = 0.56;

const startupLinkPattern = /<link rel="apple-touch-startup-image" href="\/(apple-splash-(\d+)-(\d+)\.png)" media="[^"]*-webkit-device-pixel-ratio:\s*(\d+)[^"]*">/g;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getSourcePixel = (png, x, y, channel) => (
  png.data[((y * png.width) + x) * 4 + channel]
);

const resizeBilinear = (source, targetWidth, targetHeight) => {
  const target = Buffer.alloc(targetWidth * targetHeight * 4);

  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = ((y + 0.5) * source.height / targetHeight) - 0.5;
    const y0 = clamp(Math.floor(sourceY), 0, source.height - 1);
    const y1 = clamp(y0 + 1, 0, source.height - 1);
    const yBlend = sourceY - y0;

    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = ((x + 0.5) * source.width / targetWidth) - 0.5;
      const x0 = clamp(Math.floor(sourceX), 0, source.width - 1);
      const x1 = clamp(x0 + 1, 0, source.width - 1);
      const xBlend = sourceX - x0;
      const targetIndex = ((y * targetWidth) + x) * 4;

      for (let channel = 0; channel < 4; channel += 1) {
        const top = (
          (getSourcePixel(source, x0, y0, channel) * (1 - xBlend))
          + (getSourcePixel(source, x1, y0, channel) * xBlend)
        );
        const bottom = (
          (getSourcePixel(source, x0, y1, channel) * (1 - xBlend))
          + (getSourcePixel(source, x1, y1, channel) * xBlend)
        );
        target[targetIndex + channel] = Math.round((top * (1 - yBlend)) + (bottom * yBlend));
      }
    }
  }

  return target;
};

const paintBackground = (png) => {
  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = BACKGROUND.red;
    png.data[index + 1] = BACKGROUND.green;
    png.data[index + 2] = BACKGROUND.blue;
    png.data[index + 3] = 255;
  }
};

const compositeLogo = (png, resizedLogo, logoWidth, logoHeight, left, top) => {
  for (let y = 0; y < logoHeight; y += 1) {
    for (let x = 0; x < logoWidth; x += 1) {
      const logoIndex = ((y * logoWidth) + x) * 4;
      const alpha = resizedLogo[logoIndex + 3] / 255;
      if (alpha === 0) continue;

      const targetIndex = (((top + y) * png.width) + (left + x)) * 4;
      png.data[targetIndex] = Math.round((resizedLogo[logoIndex] * alpha) + (BACKGROUND.red * (1 - alpha)));
      png.data[targetIndex + 1] = Math.round((resizedLogo[logoIndex + 1] * alpha) + (BACKGROUND.green * (1 - alpha)));
      png.data[targetIndex + 2] = Math.round((resizedLogo[logoIndex + 2] * alpha) + (BACKGROUND.blue * (1 - alpha)));
      png.data[targetIndex + 3] = 255;
    }
  }
};

const generateIcon = (fileName, size, logoScale) => {
  const png = new PNG({ width: size, height: size });
  const logoWidth = Math.round(size * logoScale);
  const logoHeight = Math.round(logoWidth * logo.height / logo.width);
  const logoLeft = Math.round((size - logoWidth) / 2);
  const logoTop = Math.round((size - logoHeight) / 2);
  const resizedLogo = resizeBilinear(logo, logoWidth, logoHeight);

  paintBackground(png);
  compositeLogo(png, resizedLogo, logoWidth, logoHeight, logoLeft, logoTop);
  fs.writeFileSync(path.join(publicDir, fileName), PNG.sync.write(png));
  console.log(`Generated ${fileName}`);
};

const startupImages = [];
let match = startupLinkPattern.exec(indexHtml);

while (match) {
  startupImages.push({
    fileName: match[1],
    width: Number(match[2]),
    height: Number(match[3]),
    pixelRatio: Number(match[4]),
  });
  match = startupLinkPattern.exec(indexHtml);
}

if (startupImages.length === 0) {
  throw new Error('No apple-touch-startup-image links found in public/index.html');
}

for (const startupImage of startupImages) {
  const png = new PNG({ width: startupImage.width, height: startupImage.height });
  const logoWidth = Math.round(LOGO_WIDTH_CSS_PX * startupImage.pixelRatio);
  const logoHeight = Math.round(logoWidth * logo.height / logo.width);
  const logoLeft = Math.round((startupImage.width - logoWidth) / 2);
  const logoTop = Math.round(
    ((startupImage.height - logoHeight) / 2)
    + (LOGO_CENTER_Y_OFFSET_CSS_PX * startupImage.pixelRatio)
  );
  const resizedLogo = resizeBilinear(logo, logoWidth, logoHeight);

  paintBackground(png);
  compositeLogo(png, resizedLogo, logoWidth, logoHeight, logoLeft, logoTop);
  fs.writeFileSync(path.join(publicDir, startupImage.fileName), PNG.sync.write(png));
  console.log(`Generated ${startupImage.fileName}`);
}

generateIcon('beerva-icon-192.png', 192, ANY_ICON_LOGO_SCALE);
generateIcon('beerva-icon-512.png', 512, ANY_ICON_LOGO_SCALE);
generateIcon('beerva-maskable-192.png', 192, MASKABLE_ICON_LOGO_SCALE);
generateIcon('beerva-maskable-512.png', 512, MASKABLE_ICON_LOGO_SCALE);
generateIcon('logo192.png', 192, ANY_ICON_LOGO_SCALE);
generateIcon('logo512.png', 512, ANY_ICON_LOGO_SCALE);
