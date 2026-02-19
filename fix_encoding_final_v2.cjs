const fs = require('fs');
const path = require('path');

const targetFile = path.resolve('src/components/AdminPanel.jsx');
let content = fs.readFileSync(targetFile, 'utf8');

const replacements = [
    { from: /­ƒîƒ/g, to: '📁' },
    { from: /ÔÅ▒´©Å/g, to: '⏱️' },
    { from: /Ô£Å´©Å/g, to: '✏️' },
    { from: /┬┐/g, to: '¿' },
    { from: /­ƒôª/g, to: '📦' },
    { from: /­ƒùæ´©Å/g, to: '🗑️' },
    { from: /ÔÜÖ´©Å/g, to: '⚙️' },
    { from: /­ƒô£/g, to: '📜' },
    { from: /ƒÆ╣/g, to: '💹' },
    { from: /Ô£à/g, to: '✅' },
    { from: /ÔØî/g, to: '❌' },
    { from: /­ƒô▒/g, to: '📱' },
    { from: /­ƒôº/g, to: '📧' },
    { from: /­ƒôê/g, to: '📊' },
    { from: /­ƒòÆ/g, to: '🕒' },
    { from: /­ƒç│­ƒç¿/g, to: '🇳🇨' }, // This looks like a flag
    { from: /­ƒô¥/g, to: '📝' },
    { from: /ÔåÉ/g, to: '⬅️' },
    { from: /┬á/g, to: ' ' }
];

replacements.forEach(r => {
    content = content.replace(r.from, r.to);
});

fs.writeFileSync(targetFile, content, 'utf8');
console.log('Fixed encoding issues in AdminPanel.jsx');
