const fs = require('fs');
const path = require('path');

const srcDir = path.join('src', 'templates');
const destDir = path.join('dist', 'templates');

fs.mkdirSync(destDir, { recursive: true });

const files = fs.readdirSync(srcDir).filter(f => f.endsWith('.html'));
for (const file of files) {
  fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
}

console.log(`Copied ${files.length} template(s) to ${destDir}`);
