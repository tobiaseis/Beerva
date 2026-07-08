const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/screens/RecordScreen.tsx'),
  'utf8'
);
const beerDraftFormSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/components/BeerDraftForm.tsx'),
  'utf8'
);

assert.match(
  source,
  /getTotalBeerQuantity/,
  'active session drink count should count quantities, not just drink rows'
);

assert.match(
  source,
  /const incrementBeerInSession = async/,
  'record screen should expose a fast increment handler for existing drinks'
);

assert.match(
  source,
  /\.from\('session_beers'\)\s*[\s\S]*?\.update\(\{\s*quantity: nextQuantity\s*\}\)/,
  'incrementing an existing drink should update its session_beers quantity'
);

assert.match(
  source,
  /onPress=\{\(\) => incrementBeerInSession\(beer\)\}/,
  'each active-session drink row should wire the plus button to increment that drink'
);

assert.match(
  source,
  /<PlusCircle color=\{colors\.primary\} size=\{17\} \/>/,
  'the fast increment action should use the plus icon beside the delete action'
);

assert.match(
  source,
  /style=\{styles\.beerRowActions\}/,
  'drink row actions should group the plus and delete controls together'
);

assert.match(
  beerDraftFormSource,
  /onSelectItem=\{selectBeverageName\}/,
  'selecting an autocomplete beverage should use a dedicated selection handler'
);

assert.match(
  beerDraftFormSource,
  /isBeverageAutoAdded/,
  'beer draft form should detect mixed drinks that auto-add from the dropdown'
);

assert.match(
  beerDraftFormSource,
  /onSubmit\(nextDraft\)/,
  'selecting an auto-add mixed drink should submit the prepared draft immediately'
);

assert.match(
  beerDraftFormSource,
  /!\s*hideDrinkControls/,
  'auto-added mixed drinks should hide size, quantity, and add-button controls while they submit'
);

assert.doesNotMatch(
  beerDraftFormSource,
  /volumeOptions/,
  'mixed-drink auto-add should avoid adding recipe-specific volume buttons to the record form'
);

assert.match(
  beerDraftFormSource,
  /const COMMON_VOLUMES = \['33cl', '50cl', 'Pint'\];/,
  'beer draft form should define a short common-size set for fast casual logging'
);

assert.match(
  beerDraftFormSource,
  /const MORE_VOLUMES = VOLUMES\.filter\(\(volume\) => !COMMON_VOLUMES\.includes\(volume\)\);/,
  'beer draft form should keep uncommon sizes available behind the size chooser'
);

assert.match(
  beerDraftFormSource,
  /setSizeSheetVisible\(true\)/,
  'beer draft form should open a size chooser instead of rendering every volume by default'
);

assert.match(
  beerDraftFormSource,
  /Change size/,
  'beer draft form should expose a clear change-size action'
);

assert.match(
  beerDraftFormSource,
  /selectedVolume\} selected/,
  'beer draft form should show the currently selected size before submit'
);

assert.doesNotMatch(
  beerDraftFormSource,
  /<Text style=\{styles\.sectionLabel\}>Size<\/Text>\s*<View style=\{styles\.volumeRow\}>/,
  'beer draft form should not show the old full volume grid in the default form'
);

console.log('record session drink checks passed');
