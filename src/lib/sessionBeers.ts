export type BeerCatalogItem = {
  name: string;
  abv: number;
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
  { name: 'Tuborg Gron', abv: 4.6 },
  { name: 'Tuborg Classic', abv: 4.6 },
  { name: 'Carlsberg Pilsner', abv: 4.6 },
  { name: 'Carlsberg 1883', abv: 4.6 },
  { name: 'Carlsberg Elephant', abv: 7.2 },
  { name: 'Tuborg Guld', abv: 5.6 },
  { name: 'Tuborg Julebryg', abv: 5.6 },
  { name: 'Tuborg Paskebryg', abv: 5.4 },
  { name: 'Grimbergen Double Ambree', abv: 6.5 },
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
  { name: 'Royal Okologisk', abv: 4.8 },
  { name: 'Schiotz Mork Mumme', abv: 6.5 },
  { name: 'Schiotz Gylden IPA', abv: 5.9 },
  { name: 'Ceres Top', abv: 4.6 },
  { name: 'Thor Pilsner', abv: 4.6 },
  { name: 'Faxe Premium', abv: 5.0 },
  { name: 'Harboe Pilsner', abv: 4.6 },
  { name: 'Harboe Classic', abv: 4.6 },
  { name: 'Harboe Bear Beer', abv: 7.7 },
  { name: 'Thisted Limfjordsporter', abv: 7.9 },
  { name: 'Thisted Thy Pilsner', abv: 4.6 },
  { name: 'Thisted Okologisk Humle', abv: 5.8 },
  { name: 'Skagen Bryghus Drachmann', abv: 5.0 },
  { name: 'Skagen Bryghus Skawbo', abv: 5.5 },
  { name: 'Fur Vulcano Classic', abv: 4.6 },
  { name: 'Fur Bock', abv: 7.6 },
  { name: 'Fur IPA', abv: 6.2 },
  { name: 'Norrebro Bryghus New York Lager', abv: 5.2 },
  { name: 'Norrebro Bryghus Bombay IPA', abv: 6.1 },
  { name: 'Norrebro Bryghus Ravnsborg Rod', abv: 5.5 },
  { name: 'Amager Bryghus Hr. Frederiksen', abv: 10.5 },
  { name: 'Amager Bryghus Todd The Axe Man', abv: 6.5 },
  { name: 'Mikkeller Peter Pale and Mary', abv: 4.6 },
  { name: 'Mikkeller Burst IPA', abv: 5.5 },
  { name: 'Mikkeller Visions Lager', abv: 4.5 },
  { name: 'Mikkeller Beer Geek Breakfast', abv: 7.5 },
  { name: 'To Ol City Session IPA', abv: 4.5 },
  { name: 'To Ol Whirl Domination', abv: 6.2 },
  { name: 'To Ol 45 Days Pilsner', abv: 4.7 },
  { name: 'To Ol Gose to Hollywood', abv: 3.8 },
  { name: 'Svaneke Classic', abv: 4.6 },
  { name: 'Svaneke Mork Guld', abv: 5.7 },
  { name: 'Svaneke Craft Pilsner', abv: 4.6 },
  { name: 'Svaneke Choco Stout', abv: 5.7 },
  { name: 'Hornbeer Black Magic Woman', abv: 10.0 },
  { name: 'Hornbeer Happy Hoppy', abv: 6.5 },
  { name: 'Braw Ale', abv: 5.5 },
  { name: 'Ale No. 16 (Refsvindinge)', abv: 5.7 },
  { name: 'Mors Stout', abv: 5.7 },
  { name: 'Hancock Hoker Bajer', abv: 5.0 },
  { name: 'Hancock Black Lager', abv: 5.0 },
  { name: 'Hancock Gambrinus', abv: 9.6 },
  { name: 'Willemoes Ale', abv: 5.2 },
  { name: 'Willemoes Stout', abv: 5.3 },
  { name: 'Aarhus Bryghus IPA', abv: 6.0 },
  { name: 'Guinness', abv: 4.2 },
  { name: 'Heineken', abv: 5.0 },
];

export const BEER_OPTIONS = BEER_CATALOG.map((beer) => beer.name);

export const VOLUMES = ['25cl', '33cl', 'Schooner', 'Pint', '50cl'];

export const createEmptyBeerDraft = (): BeerDraft => ({
  beerName: '',
  volume: 'Pint',
  quantity: 1,
});

export const createClientBeerId = () => `beer-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

export const getBeerAbv = (beerName: string) => {
  const match = BEER_CATALOG.find((beer) => beer.name.toLowerCase() === beerName.trim().toLowerCase());
  return match ? match.abv : 5.0;
};

export const beerDraftToPayload = (draft: BeerDraft) => ({
  beer_name: draft.beerName.trim(),
  volume: draft.volume,
  quantity: draft.quantity,
  abv: getBeerAbv(draft.beerName),
});

export const getBeerDrinkLabel = (beer: Pick<SessionBeer, 'volume' | 'quantity'>) => {
  const volume = beer.volume || 'Pint';
  const quantity = beer.quantity || 1;
  return quantity > 1 ? `${quantity} x ${volume}` : volume;
};

export const getBeerLine = (beer: Pick<SessionBeer, 'beer_name' | 'volume' | 'quantity'>) => {
  return `${getBeerDrinkLabel(beer)} of ${beer.beer_name || 'Beer'}`;
};

export const getTotalBeerQuantity = (beers: Array<Pick<SessionBeer, 'quantity'>>) => {
  return beers.reduce((sum, beer) => sum + (beer.quantity || 1), 0);
};

export const getSessionBeerSummary = (beers: SessionBeer[]) => {
  if (beers.length === 0) return 'No beers added';
  if (beers.length === 1) return getBeerLine(beers[0]);

  const total = getTotalBeerQuantity(beers);
  const uniqueBeerCount = new Set(beers.map((beer) => beer.beer_name).filter(Boolean)).size;
  const beerLabel = total === 1 ? 'beer' : 'beers';

  if (uniqueBeerCount > 1) {
    return `${total} ${beerLabel} across ${uniqueBeerCount} kinds`;
  }

  return `${total} ${beerLabel} of ${beers[0].beer_name || 'Beer'}`;
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
