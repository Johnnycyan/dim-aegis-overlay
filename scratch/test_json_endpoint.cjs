const https = require('https');
const fs = require('fs');

function getUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function run() {
  const url = 'https://docs.google.com/spreadsheets/d/1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY/gviz/tq?tqx=out:json&sheet=Artifact%20Mods';
  try {
    console.log('Fetching JSON from gviz/tq...');
    let text = await getUrl(url);
    
    // Remove the google.visualization.Query.setResponse(...) wrapper
    const match = text.match(/google\.visualization\.Query\.setResponse\(([\s\S]*?)\);/);
    if (match) {
      text = match[1];
    }
    
    const data = JSON.parse(text);
    fs.writeFileSync('scratch/gviz_response.json', JSON.stringify(data, null, 2));
    console.log('Wrote scratch/gviz_response.json');

    const rows = data.table.rows;
    console.log(`Total rows in JSON response: ${rows.length}`);
    
    // Log the first 5 rows' first column values
    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      const c0 = rows[r].c[0];
      const name = rows[r].c[2] ? rows[r].c[2].v : '';
      console.log(`Row ${r} (${name}):`, c0);
    }
  } catch (e) {
    console.error(e);
  }
}
run();
