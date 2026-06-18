export type BeverageKind = 'beer' | 'rtd' | 'mixed' | 'wine' | 'drink';

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
  beverage_category?: 'beer' | 'wine' | 'drink' | string | null;
  note?: string | null;
  consumed_at?: string | null;
  created_at?: string | null;
  excluded_from_stats?: boolean | null;
  excluded_from_stats_at?: string | null;
  excluded_from_stats_reason?: string | null;
};

export type BeerDraft = {
  beerName: string;
  volume: string;
  quantity: number;
};

export const BEER_CATALOG: BeerCatalogItem[] = [
  { name: 'Tuborg Grøn', abv: 4.6 },
  { name: 'Tuborg Classic', abv: 4.6 },
  { name: 'Carlsberg Pilsner', abv: 4.6, aliases: ['Carlsberg Hof'] },
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
  { name: 'Albani Classic', abv: 4.6, aliases: ['Odense Classic', 'Albani Odense Classic'] },
  { name: 'Albani Giraf Beer', abv: 7.3 },
  { name: 'Royal Pilsner', abv: 4.6 },
  { name: 'Royal Classic', abv: 4.6 },
  { name: 'Royal Export', abv: 5.4 },
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
  { name: 'Hancock Høker Bajer', abv: 5.0, aliases: ['Hancock Pilsner'] },
  { name: 'Hancock Black Lager', abv: 5.0 },
  { name: 'Willemoes Ale', abv: 5.2 },
  { name: 'Willemoes Stout', abv: 5.3 },
  { name: 'Aarhus Bryghus IPA', abv: 6.0 },
  { name: 'Guinness', abv: 4.2 },
  { name: 'Heineken', abv: 5.0 },

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
  { name: 'Royal Økologisk Pilsner', abv: 4.8, aliases: ['Royal Økologisk', 'Royal Okologisk'] },
  { name: 'Royal 0,0 Pilsner', abv: 0.0 },
  { name: 'Royal 0,0 Classic', abv: 0.0 },
  { name: 'Royal Stout', abv: 7.7 },
  { name: 'Royal Julebryg', abv: 5.6 },
  { name: 'Albani Mosaic IPA', abv: 5.7 },
  { name: 'Albani Blålys', abv: 7.0 },
  { name: 'Albani Rød Pilsner', abv: 4.6, aliases: ['Odense Rød Classic', 'Odense Roed Classic'] },
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
  { name: 'Hancock Beer', abv: 5.0 },
  { name: 'Hancock Old Gambrinus Dark', abv: 9.8, aliases: ['Hancock Gambrinus'] },
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
  { name: 'Tuborg Grøn Økologisk', abv: 4.6, aliases: ['Grøn Tuborg Økologisk'] },
  { name: 'Tuborg Rå', abv: 4.3, aliases: ['Tuborg Raa'] },
  { name: 'Carlsberg Brewmasters IPA', abv: 5.2, aliases: ['Brewmasters IPA'] },
  { name: 'Gamle Carlsberg Porter', abv: 7.8 },
  { name: 'Carlsberg Nordlyst', abv: 2.5 },
  { name: 'Carlsberg Fanbryg', abv: 5.0 },
  { name: 'Jacobsen Original Dark Lager', abv: 5.8 },
  { name: 'Jacobsen Extra Pilsner', abv: 5.5 },
  { name: 'Jacobsen Maj-Bock', abv: 7.5, aliases: ['Jacobsen Maj Bock'] },
  { name: 'Jacobsen Donker Winter Ale', abv: 7.5 },
  { name: 'Albani Rødhætte', abv: 5.6, aliases: ['Albani Roedhaette'] },
  { name: 'Albani Giraf Black', abv: 10.0, aliases: ['Giraf Black'] },
  { name: 'Albani Odense Light', abv: 2.6, aliases: ['Odense Light'] },
  { name: 'Albani Odense Extra Light', abv: 0.05, aliases: ['Odense Extra Light'] },
  { name: 'Maribo Pilsner', abv: 4.6 },
  { name: 'Maribo Classic', abv: 4.6 },
  { name: 'Maribo Julebryg', abv: 5.6 },
  { name: 'Maribo Guld', abv: 5.7 },
  { name: 'Slots Pilsner', abv: 4.6 },
  { name: 'Slots Classic', abv: 4.6 },
  { name: 'Slots Guld', abv: 5.9 },
  { name: 'Slots Julebryg', abv: 5.6 },
  { name: 'King Pilsner', abv: 4.6 },
  { name: 'Karlens Pilsner', abv: 4.6 },
  { name: 'Karlens Classic', abv: 4.6 },
  { name: 'Karlens Julebryg', abv: 5.6 },
  { name: 'Odin Pilsner', abv: 4.6 },
  { name: 'Pokal Classic', abv: 4.6 },
  { name: 'Royal Classic Øko', abv: 4.8, aliases: ['Royal Classic Økologisk'] },
  { name: 'Fuglsang Pilsner', abv: 4.6 },
  { name: 'Fuglsang Black Bird', abv: 4.8, aliases: ['Fuglsang Blackbird'] },
  { name: 'Fuglsang Early Bird', abv: 5.5 },
  { name: 'Fuglsang White Bird', abv: 5.0 },
  { name: 'Fur Renæssance Brown Ale', abv: 6.2, aliases: ['Fur Renaissance Brown Ale'] },
  { name: 'Fur Alkoholfri IPA', abv: 0.5 },
  { name: 'Fanø Rav', abv: 4.6, aliases: ['Fanoe Rav'] },
  { name: 'Fanø Stormflod', abv: 5.8, aliases: ['Fanoe Stormflod'] },
  { name: 'Hancock Saaz Brew', abv: 8.1 },
  { name: 'Skovlyst BirkeBryg', abv: 4.8, aliases: ['Skovlyst Birkebryg'] },
  { name: 'Herslev Hvedeøl', abv: 5.0, aliases: ['Herslev Hvedeol', 'Herslev Øko Hvede'] },
  { name: 'Peroni Nastro Azzurro', abv: 5.0 },
  { name: 'Peroni Nastro Azzurro 0.0', abv: 0.0 },
  { name: 'San Miguel Especial', abv: 5.4 },
  { name: 'Estrella Damm', abv: 4.6 },
  { name: 'Birra Moretti', abv: 4.6 },
  { name: 'Asahi Super Dry', abv: 5.0 },
  { name: 'Kirin Ichiban', abv: 5.0 },
  { name: 'Tiger Beer', abv: 5.0 },
  { name: 'Tsingtao', abv: 4.7 },
  { name: 'Desperados', abv: 5.9 },

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
  { name: 'Garage Hard Lemonade', abv: 4.6, kind: 'rtd', defaultVolume: '27.5cl', aliases: ['Garage Hard Lemon'] },
  { name: "Gordon's Gin & Tonic", abv: 5.0, kind: 'rtd', defaultVolume: '25cl' },
  { name: "Gordon's Pink Gin & Tonic", abv: 5.0, kind: 'rtd', defaultVolume: '25cl' },
  { name: 'Captain Morgan & Cola', abv: 5.0, kind: 'rtd', defaultVolume: '25cl' },
  { name: "Jack Daniel's & Cola", abv: 5.0, kind: 'rtd', defaultVolume: '33cl' },
  { name: 'Bacardi Mojito RTD', abv: 5.0, kind: 'rtd', defaultVolume: '25cl' },
  { name: 'Absolut Vodka Soda Raspberry', abv: 5.0, kind: 'rtd', defaultVolume: '25cl' },
  { name: 'White Wine', abv: 12.0, kind: 'wine', defaultVolume: '15cl' },
  { name: 'Red Wine', abv: 13.0, kind: 'wine', defaultVolume: '15cl' },
  {
    name: 'Gin Hass',
    abv: 37.5,
    kind: 'mixed',
    defaultVolume: '4cl',
    countedVolume: '4cl',
    aliases: ['Gin-Hass'],
  },
  {
    name: 'Gin & Tonic',
    abv: 37.5,
    kind: 'mixed',
    defaultVolume: '5cl',
    countedVolume: '5cl',
    aliases: ['Gin Tonic', 'Gin and Tonic', 'G&T'],
  },
  {
    name: 'Cosmopolitan',
    abv: 37.8,
    kind: 'mixed',
    defaultVolume: '5.5cl',
    countedVolume: '5.5cl',
    aliases: ['Cosmo'],
  },
  {
    name: 'Mojito',
    abv: 37.5,
    kind: 'mixed',
    defaultVolume: '4.5cl',
    countedVolume: '4.5cl',
  },
  {
    name: 'Margarita',
    abv: 38.6,
    kind: 'mixed',
    defaultVolume: '7cl',
    countedVolume: '7cl',
  },
  {
    name: 'Daiquiri',
    abv: 37.5,
    kind: 'mixed',
    defaultVolume: '6cl',
    countedVolume: '6cl',
  },
  {
    name: 'Old Fashioned',
    abv: 40.0,
    kind: 'mixed',
    defaultVolume: '4.5cl',
    countedVolume: '4.5cl',
  },
  {
    name: 'Whiskey Sour',
    abv: 40.0,
    kind: 'mixed',
    defaultVolume: '4.5cl',
    countedVolume: '4.5cl',
    aliases: ['Whisky Sour'],
  },
  {
    name: 'Espresso Martini',
    abv: 29.1,
    kind: 'mixed',
    defaultVolume: '8cl',
    countedVolume: '8cl',
  },
  {
    name: 'Negroni',
    abv: 26.2,
    kind: 'mixed',
    defaultVolume: '9cl',
    countedVolume: '9cl',
  },
  {
    name: 'Pina Colada',
    abv: 37.5,
    kind: 'mixed',
    defaultVolume: '5cl',
    countedVolume: '5cl',
    aliases: ['Piña Colada'],
  },
  {
    name: 'Long Island Iced Tea',
    abv: 38.0,
    kind: 'mixed',
    defaultVolume: '7.5cl',
    countedVolume: '7.5cl',
    aliases: ['Long Island Ice Tea'],
  },
  {
    name: 'Sex on the Beach',
    abv: 31.3,
    kind: 'mixed',
    defaultVolume: '6cl',
    countedVolume: '6cl',
  },
  {
    name: 'Moscow Mule',
    abv: 37.0,
    kind: 'mixed',
    defaultVolume: '4.5cl',
    countedVolume: '4.5cl',
  },
  {
    name: 'Caipirinha',
    abv: 40.0,
    kind: 'mixed',
    defaultVolume: '6cl',
    countedVolume: '6cl',
    aliases: ['Caipirina'],
  },
  {
    name: 'Aperol Spritz',
    abv: 11.0,
    kind: 'mixed',
    defaultVolume: '15cl',
    countedVolume: '15cl',
    aliases: ['Spritz'],
  },
  {
    name: 'Dry Martini',
    abv: 34.7,
    kind: 'mixed',
    defaultVolume: '7cl',
    countedVolume: '7cl',
    aliases: ['Martini', 'Gin Martini'],
  },
  {
    name: 'Manhattan',
    abv: 33.1,
    kind: 'mixed',
    defaultVolume: '7cl',
    countedVolume: '7cl',
  },
  {
    name: 'Cuba Libre',
    abv: 37.5,
    kind: 'mixed',
    defaultVolume: '5cl',
    countedVolume: '5cl',
    aliases: ['Rum and Coke', 'Rum & Coke'],
  },
  {
    name: 'Tequila Sunrise',
    abv: 38.0,
    kind: 'mixed',
    defaultVolume: '4.5cl',
    countedVolume: '4.5cl',
  },
  {
    name: 'Vodka Red Bull',
    abv: 37.0,
    kind: 'mixed',
    defaultVolume: '2cl',
    countedVolume: '2cl',
    aliases: ['Vodka Redbull', 'Vodka RedBull'],
  },
  {
    name: 'Vodka Orange Juice',
    abv: 37.0,
    kind: 'mixed',
    defaultVolume: '2cl',
    countedVolume: '2cl',
    aliases: ['Vodka Orange'],
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
  {
    name: 'Coffee Bailey',
    abv: 17.0,
    kind: 'mixed',
    defaultVolume: '4cl',
    countedVolume: '4cl',
    aliases: ['Coffee Baileys', "Coffee Bailey's", "Coffee Baileys'"],
  },
];

export const BEER_OPTIONS = BEER_CATALOG.map((beer) => beer.name);

export const VOLUMES = ['2cl', '4cl', '25cl', '27.5cl', '33cl', '40cl', '44cl', '50cl', 'Pint', '1L'];

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

export const getBeveragePayloadCategory = (beverage?: BeerCatalogItem | null): 'beer' | 'wine' | 'drink' => {
  if (beverage?.kind === 'wine') return 'wine';
  if (beverage?.kind === 'drink' || beverage?.kind === 'mixed' || beverage?.kind === 'rtd') return 'drink';
  return 'beer';
};

export const mergeBeverageCatalog = (remoteBeverages: BeerCatalogItem[] = []) => {
  const builtInKeys = new Set(BEER_CATALOG.map((item) => normalizeBeerName(item.name)));

  return [
    ...BEER_CATALOG,
    ...remoteBeverages.filter((item) => (
      item.name.trim().length > 0
      && !builtInKeys.has(normalizeBeerName(item.name))
    )),
  ];
};

export const getBeverageCatalogItem = (
  beverageName: string,
  catalog: BeerCatalogItem[] = BEER_CATALOG
) => {
  const normalizedBeverageName = normalizeBeerName(beverageName);
  return catalog.find((beverage) => (
    normalizeBeerName(beverage.name) === normalizedBeverageName
    || beverage.aliases?.some((alias) => normalizeBeerName(alias) === normalizedBeverageName)
  ));
};

export const getBeverageOptionSearchText = (
  beverageName: string,
  catalog: BeerCatalogItem[] = BEER_CATALOG
) => {
  const beverage = catalog.find((item) => item.name === beverageName) ?? getBeverageCatalogItem(beverageName, catalog);
  return [beverageName, ...(beverage?.aliases ?? [])].join(' ');
};

export const getBeverageDefaultVolume = (
  beverageName: string,
  catalog: BeerCatalogItem[] = BEER_CATALOG
) => {
  const match = getBeverageCatalogItem(beverageName, catalog);
  return match?.countedVolume || match?.defaultVolume || null;
};

export const isBeverageVolumeLocked = (
  beverageName: string,
  catalog: BeerCatalogItem[] = BEER_CATALOG
) => {
  return Boolean(getBeverageCatalogItem(beverageName, catalog)?.countedVolume);
};

export const isBeverageAutoAdded = (
  beverageName: string,
  catalog: BeerCatalogItem[] = BEER_CATALOG
) => {
  const beverage = getBeverageCatalogItem(beverageName, catalog);
  return Boolean(beverage?.kind === 'mixed' && beverage.countedVolume);
};

export const getBeerAbv = (
  beerName: string,
  catalog: BeerCatalogItem[] = BEER_CATALOG
) => {
  return getBeverageCatalogItem(beerName, catalog)?.abv ?? 5.0;
};

export const beerDraftToPayload = (
  draft: BeerDraft,
  catalog: BeerCatalogItem[] = BEER_CATALOG
) => {
  const beverage = getBeverageCatalogItem(draft.beerName, catalog);

  return {
    beer_name: beverage?.name ?? draft.beerName.trim(),
    volume: beverage?.countedVolume || draft.volume,
    quantity: draft.quantity,
    abv: beverage?.abv ?? getBeerAbv(draft.beerName, catalog),
    beverage_category: getBeveragePayloadCategory(beverage),
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
    return `${qty} x ${beverage.name}`;
  }

  return `${getBeerDrinkLabel(beer)} of ${beer.beer_name || 'Beer'}`;
};

const getBeerDisplayName = (beerName?: string | null) => {
  const trimmedName = beerName?.trim();
  const beverage = getBeverageCatalogItem(trimmedName || '');
  return beverage?.name || trimmedName || 'Beer';
};

const getBeerSummaryKey = (beerName?: string | null) => (
  normalizeBeerName(getBeerDisplayName(beerName))
);

const getBeerBreakdownKey = (beer: Pick<SessionBeer, 'beer_name' | 'volume'>) => {
  const beverage = getBeverageCatalogItem(beer.beer_name || '');
  const displayName = getBeerDisplayName(beer.beer_name);
  const volume = beverage?.kind === 'mixed' && beverage.countedVolume
    ? beverage.countedVolume
    : beer.volume || 'Pint';

  return `${normalizeBeerName(displayName)}|${volume.trim().toLowerCase()}`;
};

export const getSessionBeerBreakdownLines = (
  beers: Array<Pick<SessionBeer, 'beer_name' | 'volume' | 'quantity'>>
) => {
  const groups = new Map<string, Pick<SessionBeer, 'beer_name' | 'volume' | 'quantity'>>();

  beers.forEach((beer) => {
    const key = getBeerBreakdownKey(beer);
    const existing = groups.get(key);
    const quantity = beer.quantity || 1;

    if (existing) {
      groups.set(key, {
        ...existing,
        quantity: (existing.quantity || 1) + quantity,
      });
      return;
    }

    groups.set(key, {
      beer_name: getBeerDisplayName(beer.beer_name),
      volume: beer.volume || 'Pint',
      quantity,
    });
  });

  return Array.from(groups.values()).map((beer) => getBeerLine(beer));
};

export const getTotalBeerQuantity = (beers: Array<Pick<SessionBeer, 'quantity'>>) => {
  return beers.reduce((sum, beer) => sum + (beer.quantity || 1), 0);
};

export const getSessionBeerSummary = (beers: SessionBeer[]) => {
  if (beers.length === 0) return 'No drinks added';

  const total = getTotalBeerQuantity(beers);
  const uniqueBeerCount = new Set(beers.map((beer) => getBeerSummaryKey(beer.beer_name)).filter(Boolean)).size;
  const drinkLabel = total === 1 ? 'drink' : 'drinks';

  if (uniqueBeerCount === 1 && total > 1) {
    return `${total} x ${getBeerDisplayName(beers[0].beer_name)}`;
  }

  if (beers.length === 1) return getBeerLine(beers[0]);

  if (uniqueBeerCount > 1) {
    return `${total} ${drinkLabel} across ${uniqueBeerCount} kinds`;
  }

  return `${total} ${drinkLabel} of ${getBeerDisplayName(beers[0].beer_name)}`;
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
