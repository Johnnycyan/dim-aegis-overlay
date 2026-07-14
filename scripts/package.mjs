/**
 * Build script: produces a single release zip from the /dist folder.
 *   dim-aegis-overlay-v{version}.zip
 *
 * Run after `npm run build`:
 *   node scripts/package.mjs
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const distDir = path.join(root, 'dist');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const version = pkg.version;

// ── helpers ──────────────────────────────────────────────────────────────────

function zip(sourceDir, outFile) {
  // Use PowerShell Compress-Archive (Windows) or zip (Unix)
  if (process.platform === 'win32') {
    // Remove existing zip first
    if (fs.existsSync(outFile)) fs.unlinkSync(outFile);
    execSync(
      `powershell -Command "Compress-Archive -Path '${sourceDir}\\*' -DestinationPath '${outFile}'"`,
      { stdio: 'inherit' }
    );
  } else {
    execSync(`zip -rj "${outFile}" "${sourceDir}"`, { stdio: 'inherit' });
  }
}

// ── Package Zip ─────────────────────────────────────────────────────────────

const zipOut = path.join(root, `dim-aegis-overlay-v${version}.zip`);
console.log(`📦  Packaging Extension → ${path.basename(zipOut)}`);
zip(distDir, zipOut);
console.log(`    ✓ Done`);

// ── Package Source Zip ──────────────────────────────────────────────────────

const srcZipOut = path.join(root, `dim-aegis-overlay-src.zip`);
console.log(`📦  Packaging Source Code → ${path.basename(srcZipOut)}`);

if (fs.existsSync(srcZipOut)) fs.unlinkSync(srcZipOut);

if (process.platform === 'win32') {
  const excludeList = ['node_modules', 'dist', '.git', '.github', '*.zip', 'scratch', '.agents', '.gemini'];
  const excludeFilter = excludeList.map(item => `$_ -notlike '*\\${item}*' -and $_ -notlike '*\\${item}'`).join(' -and ');
  execSync(
    `powershell -Command "Get-ChildItem -Path '${root}' -Recurse | Where-Object { ${excludeFilter} } | Compress-Archive -DestinationPath '${srcZipOut}' -Force"`,
    { stdio: 'inherit' }
  );
} else {
  execSync(`zip -r "${srcZipOut}" . -x "node_modules/*" "dist/*" ".git/*" ".github/*" "*.zip" "scratch/*" ".agents/*" ".gemini/*"`, { stdio: 'inherit' });
}
console.log(`    ✓ Done`);

console.log('\n✅  Zips are ready:');
console.log(`   ${path.basename(zipOut)}`);
console.log(`   ${path.basename(srcZipOut)}`);


