const fs = require('fs');
const path = require('path');

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
  'Software': 'Open Innovation',
  'Hardware': 'Open Innovation',
  'Fitness & Sports': 'Open Innovation',
  'Heritage & Culture': 'Open Innovation',
  'Miscellaneous': 'Open Innovation',
  'Smart Vehicles': 'Transportation',
  'Toys & Games': 'Open Innovation'
};

// Read the CSV file
const csvPath = 'sih2025_problem_statements.csv';
let content = fs.readFileSync(csvPath, 'utf-8');

// Split into lines
const lines = content.split('\n');
const header = lines[0];

// Process each line
const fixedLines = [header];

for (let i = 1; i < lines.length; i++) {
  let line = lines[i].trim();
  if (!line) continue;
  
  // Parse CSV line (simple approach - handles quoted fields)
  const parts = [];
  let current = '';
  let inQuotes = false;
  
  for (let j = 0; j < line.length; j++) {
    const char = line[j];
    if (char === '"') {
      if (inQuotes && line[j+1] === '"') {
        current += '"';
        j++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      parts.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  parts.push(current.trim());
  
  // Expected columns: title,organization,department,track,domain,description,published,maxTeams,order
  if (parts.length >= 5) {
    const domain = parts[4].replace(/^"|"$/g, ''); // Remove quotes
    
    // Map the domain
    if (domainMap[domain]) {
      parts[4] = `"${domainMap[domain]}"`;
    } else {
      console.log(`Warning: Unknown domain "${domain}" on line ${i+1}`);
      parts[4] = '"Open Innovation"'; // Default fallback
    }
    
    fixedLines.push(parts.join(','));
  } else {
    fixedLines.push(line); // Keep as-is if malformed
  }
}

// Write fixed CSV
const outputPath = 'sih2025_problem_statements_fixed.csv';
fs.writeFileSync(outputPath, fixedLines.join('\n'), 'utf-8');

console.log(`✓ Fixed CSV saved to: ${outputPath}`);
console.log(`  Total lines processed: ${fixedLines.length - 1}`);
