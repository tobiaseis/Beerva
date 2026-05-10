export type BeverageKind = 'beer' | 'rtd' | 'mixed';

export type BeerCatalogItem = {
  name: string;
  abv: number;
  kind?: BeverageKind;
  defaultVolume?: string;
  countedVolume?: string;
  aliases?: string[];
};

export type SessionBeer = {
  id?: string;
  clientId?: string;
  session_id?: string;  
  beer_name: string;
  volume: string | null;
  quantity: number | null;
  abv: number | null;
  note?: string | null;
  consumed_at?: string | null;
  created_at?: string | null;
};

export type BeerDraft = {
  beerName: string;
  volume: string;
  quantity: number;
};

export const BEER_CATALOG: BeerCatalogItem[] = [
  { name: 'Tuborg Grøn', abv: 4.6 },
  { name: 'Tuborg Classic', abv: 4.6 },
  { name: 'Carlsberg Pilsner', abv: 4.6 },
  { name: 'Carlsberg 1883', abv: 4.6 },
  { name: 'Carlsberg Elephant', abv: 7.2 },
  { name: 'Tuborg Guld', abv: 5.6 },
  { name: 'Tuborg Julebryg', abv: 5.6 },
  { name: 'Tuborg Påskebryg', abv: 5.4 },
  { name: 'Grimbergen Double-Ambrée', abv: 6.5 },
  { name: 'Grimbergen Blonde', abv: 6.7 },
  { name: 'Kronenbourg 1664 Blanc', abv: 5.0 },
  { name: 'Jacobsen Brown Ale', abv: 6.0 },
  { name: 'Jacobsen Yakima IPA', abv: 6.5 },
  { name: 'Jacobsen Saaz Blonde', abv: 7.1 },
  { name: 'Albani Odense Pilsner', abv: 4.6 },
  { name: 'Albani Classic', abv: 4.6 },
  { name: 'Albani Giraf Beer', abv: 7.3 },
  { name: 'Royal Pilsner', abv: 4.6 },
  { name: 'Royal Classic', abv: 4.6 },
  { name: 'Royal Export', abv: 5.4 },
  { name: 'Royal Økologisk', abv: 4.8 },
  { name: 'Schiøtz Mørk Mumme', abv: 6.5 },
  { name: 'Schiøtz Gylden IPA', abv: 5.9 },
  { name: 'Ceres Top', abv: 4.6 },
  { name: 'Thor Pilsner', abv: 4.6 },
  { name: 'Faxe Premium', abv: 5.0 },
  { name: 'Harboe Pilsner', abv: 4.6 },
  { name: 'Harboe Classic', abv: 4.6 },
  { name: 'Harboe Bear Beer', abv: 7.7 },
  { name: 'Thisted Limfjordsporter', abv: 7.9 },
  { name: 'Thisted Thy Pilsner', abv: 4.6 },
  { name: 'Thisted Økologisk Humle', abv: 5.8 },
  { name: 'Skagen Bryghus Drachmann', abv: 5.0 },
  { name: 'Skagen Bryghus Skawbo', abv: 5.5 },
  { name: 'Fur Vulcano Classic', abv: 4.6 },
  { name: 'Fur Bock', abv: 7.6 },
  { name: 'Fur IPA', abv: 6.2 },
  { name: 'Nørrebro Bryghus New York Lager', abv: 5.2 },
  { name: 'Nørrebro Bryghus Bombay IPA', abv: 6.1 },
  { name: 'Nørrebro Bryghus Ravnsborg Rød', abv: 5.5 },
  { name: 'Amager Bryghus Hr. Frederiksen', abv: 10.5 },
  { name: 'Amager Bryghus Todd The Axe Man', abv: 6.5 },
  { name: 'Mikkeller Peter Pale and Mary', abv: 4.6 },
  { name: 'Mikkeller Burst IPA', abv: 5.5 },
  { name: 'Mikkeller Visions Lager', abv: 4.5 },
  { name: 'Mikkeller Beer Geek Breakfast', abv: 7.5 },
  { name: 'To Øl City Session IPA', abv: 4.5 },
  { name: 'To Øl Whirl Domination', abv: 6.2 },
  { name: 'To Øl 45 Days Pilsner', abv: 4.7 },
  { name: 'To Øl Gose to Hollywood', abv: 3.8 },
  { name: 'Svaneke Classic', abv: 4.6 },
  { name: 'Svaneke Mørk Guld', abv: 5.7 },
  { name: 'Svaneke Craft Pilsner', abv: 4.6 },
  { name: 'Svaneke Choco Stout', abv: 5.7 },
  { name: 'Hornbeer Black Magic Woman', abv: 10.0 },
  { name: 'Hornbeer Happy Hoppy', abv: 6.5 },
  { name: 'Braw Ale', abv: 5.5 },
  { name: 'Ale No. 16 (Refsvindinge)', abv: 5.7 },
  { name: 'Mors Stout', abv: 5.7 },
  { name: 'Hancock Høker Bajer', abv: 5.0 },
  { name: 'Hancock Black Lager', abv: 5.0 },
  { name: 'Hancock Gambrinus', abv: 9.6 },
  { name: 'Willemoes Ale', abv: 5.2 },
  { name: 'Willemoes Stout', abv: 5.3 },
  { name: 'Aarhus Bryghus IPA', abv: 6.0 },
  { name: 'Guinness', abv: 4.2 },
  { name: 'Heineken', abv: 5.0 },

  { name: 'Carlsberg Hof', abv: 4.2 },
  { name: 'Carlsberg Nordic Pilsner', abv: 0.5 },
  { name: 'Carlsberg Nordic Gylden Bryg', abv: 0.5 },
  { name: 'Carlsberg Nordic Ale', abv: 0.5 },
  { name: 'Carlsberg 47', abv: 7.0 },
  { name: 'Carlsberg Master Brew', abv: 10.5 },
  { name: 'Tuborg Rød', abv: 4.3 },
  { name: 'Tuborg Fine Festival', abv: 7.5 },
  { name: 'Tuborg Classic Økologisk', abv: 4.6 },
  { name: 'Tuborg Sunsæt', abv: 4.6 },
  { name: 'Tuborg NUL', abv: 0.0 },
  { name: 'Tuborg Classic 0,0', abv: 0.0 },
  { name: 'Tuborg NUL Citrus', abv: 0.0 },
  { name: 'Jacobsen Viva Classic', abv: 5.5 },
  { name: 'Jacobsen Juicy IPA', abv: 4.8 },
  { name: 'Jacobsen Juletid IPA', abv: 5.1 },
  { name: 'Jacobsen Naked Christmas Ale', abv: 7.5 },
  { name: 'Jacobsen Påske Pale Ale', abv: 5.5 },
  { name: 'Grimbergen Blanche', abv: 6.0 },
  { name: 'Grimbergen Belgian Pale Ale', abv: 5.5 },
  { name: 'Grimbergen Noël', abv: 6.5 },
  { name: 'Kronenbourg 1664 Blonde', abv: 5.5 },
  { name: 'Kronenbourg 1664 Gold', abv: 6.1 },
  { name: 'Kronenbourg Original', abv: 4.2 },
  { name: 'Kronenbourg 1664 Rosé', abv: 4.5 },
  { name: 'Royal IPA', abv: 4.6 },
  { name: 'Royal Blanche', abv: 4.6 },
  { name: 'Royal Økologisk Pilsner', abv: 4.8 },
  { name: 'Royal 0,0 Pilsner', abv: 0.0 },
  { name: 'Royal 0,0 Classic', abv: 0.0 },
  { name: 'Royal Stout', abv: 7.7 },
  { name: 'Royal Julebryg', abv: 5.6 },
  { name: 'Albani Mosaic IPA', abv: 5.7 },
  { name: 'Albani Blålys', abv: 7.0 },
  { name: 'Albani Rød Pilsner', abv: 4.6 },
  { name: 'Odense 1859', abv: 4.6 },
  { name: 'Ceres Classic', abv: 4.6 },
  { name: 'Ceres Stout', abv: 7.7 },
  { name: 'Ceres Dortmunder', abv: 5.6 },
  { name: 'Faxe Amber', abv: 5.0 },
  { name: 'Faxe Extra Strong', abv: 10.0 },
  { name: 'Faxe Red Erik', abv: 6.5 },
  { name: 'Faxe 10%', abv: 10.0 },
  { name: 'Harboe Gold', abv: 5.9 },
  { name: 'Harboe IPA', abv: 5.0 },
  { name: 'Harboe Dunkel', abv: 5.0 },
  { name: 'Harboe 1883', abv: 5.0 },
  { name: 'Vestfyen Pilsner', abv: 4.6 },
  { name: 'Vestfyen Classic', abv: 4.6 },
  { name: 'Willemoes Pilsner', abv: 4.6 },
  { name: 'Willemoes Classic', abv: 4.8 },
  { name: 'Willemoes IPA', abv: 5.9 },
  { name: 'Willemoes Brown Ale', abv: 5.7 },
  { name: 'Willemoes Jule Ale', abv: 6.5 },
  { name: 'Hancock Pilsner', abv: 5.0 },
  { name: 'Hancock Beer', abv: 5.0 },
  { name: 'Hancock Old Gambrinus Dark', abv: 9.8 },
  { name: 'Refsvindinge HP Bock', abv: 7.0 },
  { name: 'Refsvindinge Røde Mor', abv: 5.6 },
  { name: "Mikkeller Drink'in The Sun", abv: 0.3 },
  { name: "Mikkeller Drink'in The Snow", abv: 0.3 },
  { name: 'Mikkeller Limbo Raspberry', abv: 0.3 },
  { name: 'Mikkeller Limbo Yuzu', abv: 0.3 },
  { name: 'Mikkeller Green Gold', abv: 7.0 },
  { name: 'Mikkeller American Dream', abv: 4.6 },
  { name: 'Mikkeller Hop Shop IPA', abv: 4.9 },
  { name: 'Mikkeller Side Eyes Pale Ale', abv: 4.6 },
  { name: 'To Øl Reparationsbajer', abv: 5.8 },
  { name: 'To Øl Snublejuice', abv: 4.5 },
  { name: 'To Øl Implosion', abv: 0.3 },
  { name: 'To Øl House of Pale', abv: 5.5 },
  { name: 'To Øl Tropical Rumble', abv: 4.3 },
  { name: 'To Øl Sur Citra', abv: 5.5 },
  { name: 'ÅBEN Modern Lager', abv: 4.8 },
  { name: 'ÅBEN Hazy IPA', abv: 6.0 },
  { name: 'ÅBEN Pilsner', abv: 4.8 },
  { name: 'ÅBEN IPA', abv: 6.0 },
  { name: 'People Like Us Organic Pilsner', abv: 4.6 },
  { name: 'People Like Us Chameleon IPA', abv: 5.5 },
  { name: 'Anarkist New England IPA', abv: 5.4 },
  { name: 'Anarkist Hazy DIPA', abv: 7.5 },
  { name: 'Anarkist Bloody Weizen', abv: 5.2 },
  { name: 'Anarkist American Easy', abv: 0.5 },
  { name: 'Anarkist Motueka Hazy IPA', abv: 5.4 },
  { name: 'Corona Extra', abv: 4.5 },
  { name: 'Corona Cero', abv: 0.0 },
  { name: 'Budweiser Budvar Original', abv: 5.0 },
  { name: 'Budweiser', abv: 5.0 },
  { name: 'Stella Artois', abv: 5.0 },
  { name: 'Hoegaarden Wit', abv: 4.9 },
  { name: 'Leffe Blonde', abv: 6.6 },
  { name: 'Leffe Brune', abv: 6.5 },
  { name: 'Erdinger Weissbier', abv: 5.3 },
  { name: 'Erdinger Dunkel', abv: 5.3 },
  { name: 'Erdinger Alkoholfrei', abv: 0.5 },
  { name: 'Paulaner Hefe-Weissbier', abv: 5.5 },
  { name: 'Paulaner Münchner Hell', abv: 4.9 },
  { name: 'Weihenstephaner Hefeweissbier', abv: 5.4 },
  { name: 'Pilsner Urquell', abv: 4.4 },
  { name: 'Staropramen Premium', abv: 5.0 },

  { name: 'Breezer Lime', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Breezer Mango', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Breezer Orange', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Breezer Pineapple', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Breezer Watermelon', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Breezer Passion Fruit', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Breezer Strawberry', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Breezer Blueberry', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Smirnoff Ice Original', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Smirnoff Ice Raspberry', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Smirnoff Ice Tropical', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Smirnoff Ice Green Apple', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Shaker Original', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Shaker Orange', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Shaker Passion', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Shaker Sport', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Shaker Sport Plus', abv: 6.0, kind: 'rtd', defaultVolume: '30cl' },
  { name: 'Shaker Sport Pink', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Cult Mokai', abv: 4.5, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Mokaï Hyldeblomst', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Mokaï Pop Pink', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Mokaï Pink Apple', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Mokaï Peach', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Mokaï Blueberry', abv: 4.0, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Somersby Apple Cider', abv: 4.5, kind: 'rtd', defaultVolume: '33cl' },
  { name: 'Somersby Blackberry', abv: 4.5, kind: 'rtd', defaultVolume: '33cl' },
  { name: 'Somersby Elderflower Lime', abv: 4.5, kind: 'rtd', defaultVolume: '33cl' },
  { name: 'Somersby Sparkling Rosé', abv: 4.5, kind: 'rtd', defaultVolume: '33cl' },
  { name: 'Somersby Mango Lime', abv: 4.5, kind: 'rtd', defaultVolume: '33cl' },
  { name: 'Tempt Cider No. 7', abv: 4.5, kind: 'rtd', defaultVolume: '33cl' },
  { name: 'Tempt Cider No. 9', abv: 4.5, kind: 'rtd', defaultVolume: '33cl' },
  { name: 'Rekorderlig Strawberry-Lime', abv: 4.5, kind: 'rtd', defaultVolume: '33cl' },
  { name: 'Rekorderlig Wild Berries', abv: 4.5, kind: 'rtd', defaultVolume: '33cl' },
  { name: 'Garage Hard Lemon', abv: 4.6, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: 'Garage Hard Lemonade', abv: 4.6, kind: 'rtd', defaultVolume: '27.5cl' },
  { name: "Gordon's Gin & Tonic", abv: 5.0, kind: 'rtd', defaultVolume: '25cl' },
  { name: "Gordon's Pink Gin & Tonic", abv: 5.0, kind: 'rtd', defaultVolume: '25cl' },
  { name: 'Captain Morgan & Cola', abv: 5.0, kind: 'rtd', defaultVolume: '25cl' },
  { name: "Jack Daniel's & Cola", abv: 5.0, kind: 'rtd', defaultVolume: '33cl' },
  { name: 'Bacardi Mojito RTD', abv: 5.0, kind: 'rtd', defaultVolume: '25cl' },
  { name: 'Absolut Vodka Soda Raspberry', abv: 5.0, kind: 'rtd', defaultVolume: '25cl' },
  {
    name: 'Vodka Red Bull',
    abv: 37.0,
    kind: 'mixed',
    defaultVolume: '2cl',
    countedVolume: '2cl',
    aliases: ['Vodka Redbull', 'Vodka RedBull'],
  },
  {
    name: 'Jägerbomb',
    abv: 35.0,
    kind: 'mixed',
    defaultVolume: '2cl',
    countedVolume: '2cl',
    aliases: ['Jagerbomb', 'Jäger Bomb', 'Jager Bomb', 'Jaegerbomb', 'Jaeger Bomb'],
  },
  {
    name: 'Sambuca Shot',
    abv: 40.0,
    kind: 'mixed',
    defaultVolume: '2cl',
    countedVolume: '2cl',
    aliases: ['Sambuca', 'Sambuca Shots', 'Black Sambuca', 'Sambucca', 'Sambucca Shot'],
  },
];

export const BEER_OPTIONS = BEER_CATALOG.map((beer) => beer.name);

export const VOLUMES = ['2cl', '25cl', '27.5cl', '33cl', '40cl', '44cl', 'Pint', '50cl', '1L'];

export const createEmptyBeerDraft = (): BeerDraft => ({
  beerName: '',
  volume: 'Pint',
  quantity: 1,
});

export const createClientBeerId = () => `beer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const normalizeBeerName = (value: string) => (
  value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[øö]/g, 'o')
    .replace(/[æä]/g, 'ae')
    .replace(/å/g, 'a')
    .replace(/Ã¸/g, 'o')
    .replace(/Ã¦/g, 'ae')
    .replace(/Ã¥/g, 'a')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
);

export const getBeverageCatalogItem = (beverageName: string) => {
  const normalizedBeverageName = normalizeBeerName(beverageName);
  return BEER_CATALOG.find((beverage) => (
    normalizeBeerName(beverage.name) === normalizedBeverageName
    || beverage.aliases?.some((alias) => normalizeBeerName(alias) === normalizedBeverageName)
  ));
};

export const getBeverageOptionSearchText = (beverageName: string) => {
  const beverage = BEER_CATALOG.find((item) => item.name === beverageName) ?? getBeverageCatalogItem(beverageName);
  return [beverageName, ...(beverage?.aliases ?? [])].join(' ');
};

export const getBeverageDefaultVolume = (beverageName: string) => {
  const match = getBeverageCatalogItem(beverageName);
  return match?.countedVolume || match?.defaultVolume || null;
};

export const isBeverageVolumeLocked = (beverageName: string) => {
  return Boolean(getBeverageCatalogItem(beverageName)?.countedVolume);
};

export const getBeerAbv = (beerName: string) => {
  return getBeverageCatalogItem(beerName)?.abv ?? 5.0;
};

export const beerDraftToPayload = (draft: BeerDraft) => {
  const beverage = getBeverageCatalogItem(draft.beerName);

  return {
    beer_name: beverage?.name ?? draft.beerName.trim(),
    volume: beverage?.countedVolume || draft.volume,
    quantity: draft.quantity,
    abv: beverage?.abv ?? getBeerAbv(draft.beerName),
  };
};

export const getBeerDrinkLabel = (beer: Pick<SessionBeer, 'volume' | 'quantity'>) => {
  const volume = beer.volume || 'Pint';
  const quantity = beer.quantity || 1;
  return quantity > 1 ? `${quantity} x ${volume}` : volume;
};

export const getBeerLine = (beer: Pick<SessionBeer, 'beer_name' | 'volume' | 'quantity'>) => {
  const beverage = getBeverageCatalogItem(beer.beer_name || '');
  if (beverage?.kind === 'mixed' && beverage.countedVolume) {
    const qty = beer.quantity || 1;
    return qty > 1 ? `${qty} x ${beverage.name}` : beverage.name;
  }

  return `${getBeerDrinkLabel(beer)} of ${beer.beer_name || 'Beer'}`;
};

export const getTotalBeerQuantity = (beers: Array<Pick<SessionBeer, 'quantity'>>) => {
  return beers.reduce((sum, beer) => sum + (beer.quantity || 1), 0);
};

export const getSessionBeerSummary = (beers: SessionBeer[]) => {
  if (beers.length === 0) return 'No drinks added';
  if (beers.length === 1) return getBeerLine(beers[0]);

  const total = getTotalBeerQuantity(beers);
  const uniqueBeerCount = new Set(beers.map((beer) => beer.beer_name).filter(Boolean)).size;
  const drinkLabel = total === 1 ? 'drink' : 'drinks';

  if (uniqueBeerCount > 1) {
    return `${total} ${drinkLabel} across ${uniqueBeerCount} kinds`;
  }

  const beverage = getBeverageCatalogItem(beers[0].beer_name || '');
  if (beverage?.kind === 'mixed' && beverage.countedVolume) {
    return total > 1 ? `${total} x ${beverage.name}` : beverage.name;
  }

  return `${total} ${drinkLabel} of ${beers[0].beer_name || 'Beer'}`;
};

export const getLegacySessionBeerFields = (beers: SessionBeer[]) => {
  const firstBeer = beers[0];
  if (!firstBeer) {
    return {
      beer_name: null,
      volume: null,
      quantity: null,
      abv: null,
    };
  }

  return {
    beer_name: firstBeer.beer_name,
    volume: firstBeer.volume || 'Pint',
    quantity: firstBeer.quantity || 1,
    abv: firstBeer.abv ?? getBeerAbv(firstBeer.beer_name),
  };
};
