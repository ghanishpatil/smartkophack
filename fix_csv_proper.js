const fs = require('fs');

// Domain mapping from SIH format to SKH format
const domainMap = {
  'MedTech / BioTech / HealthTech': 'Health',
  'Travel & Tourism': 'Open Innovation',
  'Transportation & Logistics': 'Transportation',
  'Agriculture FoodTech & Rural Development': 'Agriculture',
  'Agriculture, FoodTech & Rural Development': 'Agriculture',
  'Disaster Management': 'Open Innovation',
  'Smart Education': 'Education',
  'Clean & Green Technology': 'Waste Management',
  'Blockchain & Cybersecurity': 'Open Innovation',
  'Robotics and Drones': 'Open Innovation',
  'Renewable / Sustainable Energy': 'Open Innovation',
  'Smart Automation': 'Industry & MSME Innovation',
  'Fitness & Sports': 'Open Innovation',
  'Heritage & Culture': 'Open Innovation',
  'Miscellaneous': 'Open Innovation',
  'Smart Vehicles': 'Transportation',
  'Toys & Games': 'Open Innovation'
};

// Proper CSV parser
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current);
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current);
  return result;
}

// Proper CSV escaping
function escapeCSV(value) {
  const s = String(value || '');
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

// Read and process
const content = fs.readFileSync('sih2025_problem_statements.csv', 'utf-8');
const lines = content.split(/\r?\n/);

const output = [];
output.push(lines[0]); // Header

let unknownDomains = new Set();

for (let i = 1; i < lines.length; i++) {
  const line = lines[i].trim();
  if (!line) continue;
  
  const fields = parseCSVLine(line);
  
  // Expected: title,organization,department,track,domain,description,published,maxTeams,order
  if (fields.length >= 5) {
    const domain = fields[4].trim();
    
    if (domainMap[domain]) {
      fields[4] = domainMap[domain];
    } else if (domain) {
      unknownDomains.add(domain);
      fields[4] = 'Open Innovation'; // Default fallback
    }
    
    // Re-escape all fields
    const escaped = fields.map(f => escapeCSV(f));
    output.push(escaped.join(','));
  } else {
    output.push(line);
  }
}

fs.writeFileSync('sih2025_problem_statements_fixed.csv', output.join('\n'), 'utf-8');

console.log(`✓ Fixed CSV saved`);
console.log(`  Total rows: ${output.length - 1}`);
if (unknownDomains.size > 0) {
  console.log(`  Unknown domains mapped to 'Open Innovation':`);
  unknownDomains.forEach(d => console.log(`    - ${d}`));
}
