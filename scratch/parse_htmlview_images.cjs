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
  const url = 'https://docs.google.com/spreadsheets/d/1JM-0SlxVDAi-C6rGVlLxa-J1WGewEeL8Qvq4htWZHhY/htmlview';
  try {
    console.log('Fetching htmlview...');
    const html = await getUrl(url);
    console.log('Fetched HTML length:', html.length);

    // Look for bootstrapData JSON
    const match = html.match(/bootstrapData\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
    if (!match) {
      console.log('Could not find bootstrapData script block.');
      return;
    }
    console.log('Found bootstrapData script block!');
    
    // Write bootstrapData to file for inspection
    fs.writeFileSync('scratch/bootstrapData.json', match[1]);
    console.log('Wrote bootstrapData.json');

    // Parse the JSON (or regex search it for googleusercontent)
    const googleusercontentUrls = [];
    const urlRegex = /https?:\/\/[^\s"'\\<>]+?googleusercontent[^\s"'\\<>]+/gi;
    let uMatch;
    while ((uMatch = urlRegex.exec(match[1])) !== null) {
      googleusercontentUrls.push(uMatch[0]);
    }
    console.log(`Found ${googleusercontentUrls.length} googleusercontent URLs in bootstrapData.`);
    console.log('Samples:', Array.from(new Set(googleusercontentUrls)).slice(0, 10));
  } catch (e) {
    console.error(e);
  }
}
run();
