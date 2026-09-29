'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getStockPrice, searchStocksAction } from '@/actions/investment.actions';
import { get } from '@/lib/i18n';

export interface StockMatch {
  symbol: string;
  name: string;
}

export interface PricedStock extends StockMatch {
  priceCents: number;
  currency: string;
}

export interface AssetSearchState {
  query: string;
  searching: boolean;
  matches: StockMatch[];
  selectedStock: StockMatch | null;
  fetchingPrice: boolean;
  pricedStock: PricedStock | null;
  searchError: string | null;
  handleQueryChange: (value: string) => void;
  handlePickStock: (stock: StockMatch) => Promise<void>;
  resetSearch: () => void;
}

/**
 * Two-phase asset search used by `AssetSearchModal`: symbol autocomplete first,
 * then the live price for the picked symbol.
 *
 * Extracted as a hook so the modal component only orchestrates rendering and the
 * buy flow, keeping the component's own cognitive complexity low (S3776).
 * Behaviour, guards and error messages are unchanged from the inline version.
 */
export function useAssetSearch(
  dictionary: Record<string, unknown>,
  onPriced: (priceCents: number) => void
): AssetSearchState {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<StockMatch[]>([]);
  const [selectedStock, setSelectedStock] = useState<StockMatch | null>(null);
  const [fetchingPrice, setFetchingPrice] = useState(false);
  const [pricedStock, setPricedStock] = useState<PricedStock | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Clear any pending debounce when the consumer unmounts.
  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    },
    []
  );

  // Phase 1: search symbols via autocomplete (debounced by the caller).
  const doSearch = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setMatches([]);
        setSearchError(null);
        return;
      }

      setSearching(true);
      setSearchError(null);
      setMatches([]);
      setSelectedStock(null);
      setPricedStock(null);

      try {
        const res = await searchStocksAction({ symbol: trimmed });
        if (res.success && Array.isArray(res.data) && res.data.length > 0) {
          setMatches(res.data as StockMatch[]);
        } else {
          setSearchError(get(dictionary, 'stockNotFound'));
        }
      } catch {
        setSearchError(get(dictionary, 'stockNotFound'));
      } finally {
        setSearching(false);
      }
    },
    [dictionary]
  );

  function handleQueryChange(value: string) {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => doSearch(value), 300);
  }

  // Phase 2: fetch the live price when the user picks a symbol.
  async function handlePickStock(stock: StockMatch) {
    setSelectedStock(stock);
    setPricedStock(null);
    setFetchingPrice(true);
    setSearchError(null);
    setMatches([]); // close dropdown

    try {
      const res = await getStockPrice({ symbol: stock.symbol });
      if (res.success && res.data) {
        const data = res.data as {
          symbol: string;
          price: number;
          priceCents: number;
          currency: string;
        };
        const priced: PricedStock = {
          symbol: data.symbol,
          name: stock.name,
          priceCents: data.priceCents,
          currency: data.currency ?? 'USD',
        };
        setPricedStock(priced);
        onPriced(data.priceCents);
      } else {
        // Reset the selection so the search UI (and the error) is visible again.
        setSelectedStock(null);
        setSearchError(get(dictionary, 'priceFailed'));
      }
    } catch {
      setSelectedStock(null);
      setSearchError(get(dictionary, 'priceFailed'));
    } finally {
      setFetchingPrice(false);
    }
  }

  const resetSearch = useCallback(() => {
    setQuery('');
    setMatches([]);
    setSelectedStock(null);
    setPricedStock(null);
    setSearchError(null);
  }, []);

  return {
    query,
    searching,
    matches,
    selectedStock,
    fetchingPrice,
    pricedStock,
    searchError,
    handleQueryChange,
    handlePickStock,
    resetSearch,
  };
}
