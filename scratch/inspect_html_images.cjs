const fs = require('fs');

try {
  const path = 'C:\\Users\\Mahdi\\.gemini\\antigravity\\brain\\12784856-6625-4545-a212-c7e696cb7c39\\scratch\\sheet.html';
  if (!fs.existsSync(path)) {
    console.log('File does not exist at:', path);
    return;
  }
  const html = fs.readFileSync(path, 'utf8');
  console.log('HTML size:', html.length);
  
  // Search for any image tags or googleusercontent / docs.google.com URLs
  const imgUrls = [];
  const regex = /https?:\/\/[^\s"'<>]+?(?:googleusercontent|ggpht|google|bungie)[^\s"'<>]*?(?:png|jpg|webp|gif|svg)?/gi;
  let match;
  while ((match = regex.exec(html)) !== null) {
    imgUrls.push(match[0]);
  }
  
  console.log(`Found ${imgUrls.length} potential image/google URLs.`);
  console.log('Unique samples:', Array.from(new Set(imgUrls)).slice(0, 30));
} catch (e) {
  console.error(e);
}
