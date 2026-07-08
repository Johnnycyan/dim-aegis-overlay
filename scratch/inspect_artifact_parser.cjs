const https = require('https');

function getUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

function parseCSV(text) {
  const lines = [];
  let row = [""];
  let insideQuote = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (char === '"') {
      if (insideQuote && nextChar === '"') {
        row[row.length - 1] += '"';
        i++;
      } else {
        insideQuote = !insideQuote;
      }
    } else if (char === ',' && !insideQuote) {
      row.push('');
    } else if ((char === '\r' || char === '\n') && !insideQuote) {
      if (char === '\r' && nextChar === '\n') {
        i++;
      }
      lines.push(row);
      row = [''];
    } else {
      row[row.length - 1] += char;
    }
  }
  if (row.length > 1 || row[0] !== '') {
    lines.push(row);
  }
  return lines;
}

async function run() {
  const url = 'https://docs.google.com/spreadsheets/d/1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY/gviz/tq?tqx=out:csv&sheet=Artifact%20Mods';
  try {
    const csv = await getUrl(url);
    const rows = parseCSV(csv);
    console.log(`Total CSV rows: ${rows.length}`);
    
    let skippedShort = 0;
    let skippedEmptyName = 0;
    let parsedCount = 0;
    const parsedByArtifact = {};

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      if (row.length < 3) {
        skippedShort++;
        continue;
      }
      const name = (row[2] || '').trim();
      if (!name || name === 'Mod' || name === 'Artifact') {
        skippedEmptyName++;
        continue;
      }
      
      parsedCount++;
      const artifact = (row[1] || '').trim() || 'Unknown Artifact';
      if (!parsedByArtifact[artifact]) {
        parsedByArtifact[artifact] = [];
      }
      parsedByArtifact[artifact].push({
        name,
        length: row.length,
        rating: row[8] || ''
      });
    }

    console.log(`Skipped short (len < 3): ${skippedShort}`);
    console.log(`Skipped empty name: ${skippedEmptyName}`);
    console.log(`Parsed mods count: ${parsedCount}`);
    console.log('\nParsed mods by Artifact:');
    for (const art in parsedByArtifact) {
      console.log(`- ${art}: ${parsedByArtifact[art].length} mods (avg row length: ${parsedByArtifact[art].map(x => x.length).reduce((a,b)=>a+b,0)/parsedByArtifact[art].length})`);
      // Print first 5 and their row lengths
      console.log('  Samples:', parsedByArtifact[art].slice(0, 5).map(x => `${x.name} (len: ${x.length})`));
    }
  } catch (e) {
    console.error(e);
  }
}
run();
