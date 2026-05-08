import fs from 'fs';
import path from 'path';

const cssPath = 'packages/shared/src/styles/globals.css';
const css = fs.readFileSync(cssPath, 'utf8');

const defined = [...css.matchAll(/^\s*--([\w-]+):/gm)].map(m => m[1]);

// Build one big string of all source files to search
const exts = ['.tsx', '.ts', '.js', '.css', '.html'];
const dirs = ['apps', 'packages'];

function walk(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.includes('node_modules') && !entry.name.includes('.git')) {
      return walk(full);
    }
    if (entry.isFile() && exts.includes(path.extname(entry.name))) {
      return [full];
    }
    return [];
  });
}

const files = dirs.flatMap(walk);
const allSource = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');

// --color-X vars are consumed as Tailwind classes (bg-X, text-X, etc.)
// so strip the --color- prefix and search for the bare name too
const dead = defined.filter(name => {
  const directRef = `--${name}`;
  // For --color-foo-bar, also check if 'foo-bar' appears as a Tailwind class
  const tailwindName = name.startsWith('color-') ? name.slice(6) : null;
  
  const usedDirect = allSource.includes(directRef);
  const usedTailwind = tailwindName ? (
    allSource.includes(`-${tailwindName}`) ||
    allSource.includes(`/${tailwindName}`)
  ) : false;
  
  return !usedDirect && !usedTailwind;
});

console.log('Likely dead (not referenced directly or as Tailwind class):\n');
dead.forEach(n => console.log('  --' + n));
console.log('\nTotal:', dead.length);
console.log('Scanned', files.length, 'files');