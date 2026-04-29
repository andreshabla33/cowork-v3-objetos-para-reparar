import https from 'https';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    }).on('error', reject);
  });
}

async function findKey() {
  console.log('Fetching HTML...');
  const html = await fetchUrl('https://cowork-v3.vercel.app/');
  
  // Find all JS files
  const matches = html.match(/\/assets\/[^"]+\.js/g);
  if (!matches) {
    console.log('No JS files found');
    return;
  }
  
  for (const match of matches) {
    const url = 'https://cowork-v3.vercel.app' + match;
    console.log('Fetching', url);
    const js = await fetchUrl(url);
    const keyMatch = js.match(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/);
    if (keyMatch) {
      console.log('\nFOUND KEY in', match);
      console.log('KEY:', keyMatch[0]);
      return;
    }
  }
  console.log('Key not found');
}

findKey();
