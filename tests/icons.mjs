// Builds the app icons from an SVG drawn in this file: node tests/icons.mjs
// - icon-192.png / icon-512.png: rounded square (purpose "any")
// - icon-maskable-512.png: full-bleed square, symbol inside the Android safe zone (purpose "maskable")
// The symbol is a circle of members around the pot (the gold coin).
import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const TEAL = '#13255b', DEEP = '#0b1640', GOLD = '#f4b73f', MINT = '#cdd8fb';
function svg({ rounded, scale }) {
  const people = Array.from({ length: 6 }, (_, i) => {
    const a = (i / 6) * Math.PI * 2 - Math.PI / 2, x = 256 + Math.cos(a) * 150, y = 256 + Math.sin(a) * 150;
    return `<circle cx="${x.toFixed(1)}" cy="${(y - 14).toFixed(1)}" r="21" fill="${MINT}"/><path d="M${(x - 34).toFixed(1)} ${(y + 38).toFixed(1)}a34 30 0 0 1 68 0z" fill="${MINT}"/>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
    <rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="${TEAL}"/>
    <g transform="translate(256 256) scale(${scale}) translate(-256 -256)">
      <circle cx="256" cy="256" r="196" fill="none" stroke="${DEEP}" stroke-width="10"/>
      ${people}
      <circle cx="256" cy="256" r="70" fill="${GOLD}"/><circle cx="256" cy="256" r="52" fill="none" stroke="#c58b1c" stroke-width="6"/>
      <text x="256" y="278" font-family="system-ui, sans-serif" font-size="68" font-weight="800" text-anchor="middle" fill="#3b2a00">E</text>
    </g></svg>`;
}
const browser = await chromium.launch();
const page = await browser.newPage();
const out = {};
for (const [name, size, opts] of [['icon-192.png', 192, { rounded: true, scale: 1.12 }], ['icon-512.png', 512, { rounded: true, scale: 1.12 }], ['icon-maskable-512.png', 512, { rounded: false, scale: 0.82 }]]) {
  const b64 = await page.evaluate(async ({ s, size }) => {
    const im = new Image(); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(s); await im.decode();
    const c = document.createElement('canvas'); c.width = c.height = size; c.getContext('2d').drawImage(im, 0, 0, size, size);
    return c.toDataURL('image/png').split(',')[1];
  }, { s: svg(opts), size });
  writeFileSync(new URL('../icons/' + name, import.meta.url), Buffer.from(b64, 'base64')); out[name] = true;
}
await browser.close();
console.log('Icons written:', Object.keys(out).join(', '));
