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

// tsc 只输出 .ts 的编译结果，运行时要用的静态资源（如 CDict 赞赏码图片）需要单独搬到 dist。
const assetSrcDir = path.join('src', 'assets');
const assetDestDir = path.join('dist', 'assets');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const fromPath = path.join(from, entry.name);
    const toPath = path.join(to, entry.name);
    if (entry.isDirectory()) {
      count += copyDir(fromPath, toPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(fromPath, toPath);
      count += 1;
    }
  }
  return count;
}

if (fs.existsSync(assetSrcDir)) {
  const assetCount = copyDir(assetSrcDir, assetDestDir);
  console.log(`Copied ${assetCount} asset(s) to ${assetDestDir}`);
}
