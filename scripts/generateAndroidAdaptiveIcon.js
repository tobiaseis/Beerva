const fs = require('node:fs');
const path = require('node:path');
const { PNG } = require('pngjs');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'assets', 'beerva-app-icon.png');
const outputPath = path.join(root, 'assets', 'beerva-android-adaptive-foreground.png');
const canvasSize = 432;
const contentSize = 362;
const offset = Math.floor((canvasSize - contentSize) / 2);

const source = PNG.sync.read(fs.readFileSync(sourcePath));
const output = new PNG({ height: canvasSize, width: canvasSize });

for (let y = 0; y < contentSize; y += 1) {
  const sourceY = Math.min(source.height - 1, Math.floor((y / contentSize) * source.height));

  for (let x = 0; x < contentSize; x += 1) {
    const sourceX = Math.min(source.width - 1, Math.floor((x / contentSize) * source.width));
    const sourceOffset = (sourceY * source.width + sourceX) * 4;
    const outputOffset = ((y + offset) * canvasSize + x + offset) * 4;

    output.data[outputOffset] = source.data[sourceOffset];
    output.data[outputOffset + 1] = source.data[sourceOffset + 1];
    output.data[outputOffset + 2] = source.data[sourceOffset + 2];
    output.data[outputOffset + 3] = source.data[sourceOffset + 3];
  }
}

fs.writeFileSync(outputPath, PNG.sync.write(output));
console.log(`Generated ${path.relative(root, outputPath)}`);
