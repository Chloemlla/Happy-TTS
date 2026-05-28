import React, { useMemo } from 'react';
import { m } from 'framer-motion';
import { FaInfoCircle } from 'react-icons/fa';
import { NO_DURATION } from './motion';
import type { EnvItem } from './types';

interface EnvRowProps {
  item: EnvItem;
  idx: number;
  prefersReducedMotion: boolean;
  onSourceClick: (source: string) => void;
}

const EnvRow = React.memo(function EnvRow({ item, idx, prefersReducedMotion, onSourceClick }: EnvRowProps) {
  const rowTransition = useMemo(() => (
    prefersReducedMotion ? NO_DURATION : { duration: 0.3, delay: idx * 0.05 }
  ), [prefersReducedMotion, idx]);

  return (
    <m.tr
      className={`border-b border-gray-100 last:border-b-0 ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'
        }`}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={rowTransition}
      whileHover={{ backgroundColor: '#f8fafc' }}
    >
      <td className="px-4 py-3 font-mono text-sm font-medium text-gray-900 align-top">
        <div className="break-words whitespace-normal leading-relaxed flex items-start gap-1">
          {item.source && (
            <button
              onClick={() => onSourceClick(item.source!)}
              className="w-3 h-3 sm:w-4 sm:h-4 text-blue-500 mt-0.5 flex-shrink-0 hover:text-blue-600 transition-colors cursor-pointer"
            >
              <FaInfoCircle />
            </button>
          )}
          <span>{item.key.split(':').pop() || item.key}</span>
        </div>
      </td>
      <td className="px-4 py-3 font-mono text-sm text-gray-700 align-top">
        <div className="break-words whitespace-pre-wrap leading-relaxed">
          {item.value}
        </div>
      </td>
    </m.tr>
  );
});

export default EnvRow;
