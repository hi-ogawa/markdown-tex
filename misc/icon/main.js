const puppeteer = require('puppeteer');

const url = `file://${process.cwd()}/icon.html`;
const outfile = process.argv[2];
if (!outfile) {
  console.error('Usage: <program> <outfile>');
  process.exitCode = 1;
  return;
}

const mainAsync = async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2' });
  await page.screenshot({
    path: outfile,
    omitBackground: true,
    clip: {
      x: 11, y: 11,
      width: 32, height: 32,
    }
  });
  await browser.close();
}

mainAsync();
