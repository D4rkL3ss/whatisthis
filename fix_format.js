const fs = require('fs');
const file = 'c:\\Users\\migue\\Documents\\GitHub\\whatisthis\\src\\App.tsx';
let content = fs.readFileSync(file, 'utf8');

// Find the id: 3 content between backticks
const marker = "{ id: 3, title: 'Echoes of the Shattered', content: `";
const idx = content.indexOf(marker);
if (idx < 0) { process.exit(1); }

const contentStart = idx + marker.length;
const rest = content.substring(contentStart);
const endMarker = '`, type:';
const endIdx = rest.indexOf(endMarker);
if (endIdx < 0) { process.exit(1); }

let inner = rest.substring(0, endIdx);

// Clean up: remove stray single quote after first paragraph
inner = inner.replace(/'\r?\n/, '\n');
// Normalize line endings
inner = inner.replace(/\r\n/g, '\n');
// Collapse triple+ newlines to double
inner = inner.replace(/\n{3,}/g, '\n\n');

// Split into paragraphs and ensure clean double-newline separation
const paragraphs = inner.split('\n\n').map(p => p.trim()).filter(Boolean);
const formatted = paragraphs.join('\n\n');

const before = content.substring(0, idx);
const after = rest.substring(endIdx);
content = before + "{ id: 3, title: 'Echoes of the Shattered', content: `" + formatted + after;

fs.writeFileSync(file, content, 'utf8');
