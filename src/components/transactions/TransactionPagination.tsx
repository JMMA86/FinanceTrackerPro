'use client';

import { useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { get } from '@/lib/i18n';

interface TransactionPaginationProps {
  currentPage: number;
  totalPages: number;
  dictionary: Record<string, unknown>;
}

export function TransactionPagination({
  currentPage,
  totalPages,
  dictionary,
}: Readonly<TransactionPaginationProps>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const goToPage = useCallback(
    (page: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (page <= 1) {
        params.delete('page');
      } else {
        params.set('page', String(page));
      }
      const query = params.toString();
      const queryStr = query ? `?${query}` : '';
      router.push(`${pathname}${queryStr}`);
    },
    [router, pathname, searchParams]
  );

  const isFirstPage = currentPage <= 1;
  const isLastPage = currentPage >= totalPages;

  if (totalPages <= 1) return null;

  const btnBase =
    'inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 disabled:opacity-40 disabled:pointer-events-none';

  return (
    <nav role="navigation" aria-label={get(dictionary, 'title')} className="flex items-center gap-3">
      {/* Previous */}
      <button
        type="button"
        onClick={() => goToPage(currentPage - 1)}
        disabled={isFirstPage}
        className={`${btnBase} text-slate-300 hover:bg-white/5 border border-white/10`}
        aria-label={get(dictionary, 'previousPage')}
      >
        <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
        {get(dictionary, 'previousPage')}
      </button>

      {/* Page info */}
      <span className="text-sm text-slate-400 tabular-nums whitespace-nowrap" aria-current="page">
        {currentPage} / {totalPages}
      </span>

      {/* Next */}
      <button
        type="button"
        onClick={() => goToPage(currentPage + 1)}
        disabled={isLastPage}
        className={`${btnBase} text-slate-300 hover:bg-white/5 border border-white/10`}
        aria-label={get(dictionary, 'nextPage')}
      >
        {get(dictionary, 'nextPage')}
        <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </nav>
  );
}
