const fs = require('fs');
const CleanCSS = require('clean-css');

function buildCss() {
  if (!fs.existsSync('css/style.css')) return;
  const original = fs.readFileSync('css/style.css', 'utf8');

  // Generate minified CSS while preserving cascade & media query ordering
  const output = new CleanCSS({
    level: {
      1: { all: true },
      2: {
        mergeAdjacentRules: true,
        removeDuplicateRules: true,
        restructureRules: false
      }
    }
  }).minify(original);

  if (output.errors && output.errors.length > 0) {
    console.error('CSS minification errors:', output.errors);
    process.exit(1);
  }

  fs.writeFileSync('css/style.min.css', output.styles + '\n');
  console.log('Successfully built css/style.min.css (' + output.styles.length + ' bytes)');
}

buildCss();

