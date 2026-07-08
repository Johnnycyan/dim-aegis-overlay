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
    const nonEmpty = rows.filter((r, idx) => idx > 0 && r[0]);
    console.log(`Total rows: ${rows.length}`);
    console.log(`Non-empty row[0] count: ${nonEmpty.length}`);
    if (nonEmpty.length > 0) {
      console.log('First 15 non-empty images:');
      nonEmpty.slice(0, 15).forEach((r) => {
        console.log(`- ${r[2]} (${r[1]}): ${r[0]}`);
      });
    }
  } catch (e) {
    console.error(e);
  }
}
run();
