const fs = require('fs');

const content = fs.readFileSync('sih2025_problem_statements_fixed.csv', 'utf-8');
const lines = content.split('\n');

const header = lines[0];
const dataLines = lines.slice(1).filter(line => line.trim()); // Remove empty lines

console.log(`Total problem statements: ${dataLines.length}`);

if (dataLines.length <= 200) {
  console.log('✓ File is within 200 limit, no split needed');
  process.exit(0);
}

// Split into batches of 200
const batch1Lines = [header, ...dataLines.slice(0, 200)];
const batch2Lines = [header, ...dataLines.slice(200)];

fs.writeFileSync('sih2025_ps_batch1.csv', batch1Lines.join('\n'), 'utf-8');
fs.writeFileSync('sih2025_ps_batch2.csv', batch2Lines.join('\n'), 'utf-8');

console.log(`✓ Split into 2 files:`);
console.log(`  - sih2025_ps_batch1.csv (${batch1Lines.length - 1} rows)`);
console.log(`  - sih2025_ps_batch2.csv (${batch2Lines.length - 1} rows)`);
