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
const editSessionSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/screens/EditSessionScreen.tsx'),
  'utf8'
);
const submissionHelperSource = fs.readFileSync(
  path.resolve(__dirname, '..', 'src/lib/beverageSubmissions.ts'),
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
  submissionHelperSource,
  /submitSessionBeverage/,
  'submission helper should expose the user-facing beverage submission RPC'
);

assert.match(
  beerDraftFormSource,
  /isUnknownBeverageName/,
  'beer draft form should detect unknown catalog beverage names'
);

assert.match(
  beerDraftFormSource,
  /Add as new drink/,
  'beer draft form should expose an explicit new-drink path'
);

assert.match(
  beerDraftFormSource,
  /Beer[\s\S]*Wine[\s\S]*Drink/,
  'beer draft form should let users choose the submitted beverage category'
);

assert.match(
  beerDraftFormSource,
  /ABV/,
  'beer draft form should ask for ABV on unknown beverage submissions'
);

assert.match(
  source,
  /submitSessionBeverage/,
  'record screen should submit unknown beverages through the RPC helper'
);

assert.match(
  editSessionSource,
  /submitSessionBeverage/,
  'edit session screen should submit new unknown beverages through the RPC helper'
);

assert.match(
  source,
  /beverage_submission_id/,
  'record screen should select beverage submission linkage fields'
);

assert.match(
  editSessionSource,
  /beverage_submission_status/,
  'edit session screen should preserve beverage submission status fields'
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

assert.match(
  beerDraftFormSource,
  /placeholder="Search for your drink"/,
  'drink input should use explicit search-oriented placeholder copy'
);

assert.match(
  beerDraftFormSource,
  /Search color=\{colors\.primary\} size=\{20\} \/>/,
  'drink input should use a search icon with stronger affordance than the generic beer icon'
);

assert.match(
  beerDraftFormSource,
  /inputWrapperStyle=\{styles\.drinkSearchWrapper\}/,
  'drink input should use a lighter integrated search surface'
);

assert.doesNotMatch(
  beerDraftFormSource,
  /placeholder="What are you drinking\?"/,
  'drink input should not keep button-like vague placeholder copy'
);

assert.match(
  beerDraftFormSource,
  /quantityInlineLabel/,
  'quantity controls should use a compact inline label instead of a large standalone block'
);

assert.doesNotMatch(
  beerDraftFormSource,
  /<Text style=\{styles\.sectionLabel\}>Size<\/Text>\s*<View style=\{styles\.volumeRow\}>/,
  'beer draft form should not show the old full volume grid in the default form'
);

assert.match(
  source,
  /submitLabel="Add Drink"/,
  'record screen should use Add Drink as the primary logging copy'
);

assert.doesNotMatch(
  source,
  /submitLabel="Add Booze"/,
  'record screen should not use the less clear Add Booze copy'
);

assert.match(
  source,
  /<AppButton\s+label="End Session"\s+variant="danger"\s+onPress=\{endSession\}\s+loading=\{ending\}\s+\/>/,
  'normal End Session should use danger styling instead of primary styling'
);

assert.match(
  source,
  /<Text style=\{styles\.incrementBeerLabel\}>\+1<\/Text>/,
  'existing drink rows should show the repeat action as a visible +1 same-again control'
);

console.log('record session drink checks passed');
