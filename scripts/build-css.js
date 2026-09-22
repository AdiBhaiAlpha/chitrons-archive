const fs = require('fs');
const CleanCSS = require('clean-css');

function buildCss() {
  if (!fs.existsSync('css/style.css')) return;
  const original = fs.readFileSync('css/style.css', 'utf8');

  // Generate minified CSS
  const minified = new CleanCSS({ level: 2 }).minify(original).styles;
  fs.writeFileSync('css/style.min.css', minified);
  console.log('Successfully built css/style.min.css (' + minified.length + ' bytes)');
}

buildCss();
