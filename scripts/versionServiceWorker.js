const fs = require('fs');
const path = require('path');

const swPath = path.join(__dirname, '..', 'dist', 'sw.js');

if (!fs.existsSync(swPath)) {
  console.warn('versionServiceWorker: dist/sw.js not found. Skipping versioning.');
  process.exit(0);
}

try {
  let swContent = fs.readFileSync(swPath, 'utf8');
  const newCacheName = `beerva-cache-${Date.now()}`;
  
  // Replace the hardcoded cache name
  const updatedContent = swContent.replace(
    /const CACHE_NAME = ['"]beerva-cache-[^'"]+['"];/,
    `const CACHE_NAME = '${newCacheName}';`
  );

  if (swContent !== updatedContent) {
    fs.writeFileSync(swPath, updatedContent, 'utf8');
    console.log(`Successfully versioned Service Worker to: ${newCacheName}`);
  } else {
    console.warn('versionServiceWorker: Could not find CACHE_NAME string to replace.');
  }
} catch (error) {
  console.error('Error versioning Service Worker:', error);
  process.exit(1);
}
