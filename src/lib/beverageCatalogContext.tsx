import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { AdminBeverage, fetchAdminBeverages } from './adminApi';
import { BEER_CATALOG, BEER_OPTIONS, BeerCatalogItem, mergeBeverageCatalog } from './sessionBeers';

type BeverageCatalogContextValue = {
  catalog: BeerCatalogItem[];
  options: string[];
  refresh: () => Promise<void>;
};

const BeverageCatalogContext = createContext<BeverageCatalogContextValue>({
  catalog: BEER_CATALOG,
  options: BEER_OPTIONS,
  refresh: async () => {},
});

export const adminBeverageToCatalogItem = ({
  name,
  abv,
  category,
}: Pick<AdminBeverage, 'name' | 'abv' | 'category'>): BeerCatalogItem => {
  if (category === 'wine') {
    return { name, abv, kind: 'wine', defaultVolume: '15cl' };
  }

  if (category === 'drink') {
    return { name, abv, kind: 'drink' };
  }

  return { name, abv, kind: 'beer' };
};

export const BeverageCatalogProvider = ({ children }: { children: React.ReactNode }) => {
  const [remoteBeverages, setRemoteBeverages] = useState<BeerCatalogItem[]>([]);

  const refresh = useCallback(async () => {
    try {
      const rows = await fetchAdminBeverages();
      setRemoteBeverages(rows.map(adminBeverageToCatalogItem));
    } catch (error) {
      console.warn('Admin beverages unavailable:', error);
      setRemoteBeverages([]);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const catalog = useMemo(() => mergeBeverageCatalog(remoteBeverages), [remoteBeverages]);
  const value = useMemo(() => ({
    catalog,
    options: catalog.map((item) => item.name),
    refresh,
  }), [catalog, refresh]);

  return (
    <BeverageCatalogContext.Provider value={value}>
      {children}
    </BeverageCatalogContext.Provider>
  );
};

export const useBeverageCatalog = () => useContext(BeverageCatalogContext);
