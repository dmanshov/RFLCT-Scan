import type { ScoreIndicator } from '@/types/scan';
import clsx from 'clsx';

interface Props {
  indicator: ScoreIndicator;
}

const verdictConfig = {
  good: { bar: 'bg-green-500', text: 'text-green-600', badge: 'bg-green-50 text-green-700' },
  average: { bar: 'bg-orange-400', text: 'text-orange-500', badge: 'bg-orange-50 text-orange-700' },
  poor: { bar: 'bg-red-500', text: 'text-red-600', badge: 'bg-red-50 text-red-700' },
};

export default function IndicatorCard({ indicator }: Props) {
  const cfg = verdictConfig[indicator.verdict];

  return (
    <div className="card p-5 animate-fade-in">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm text-gray-800">{indicator.label}</h3>
        <span className={clsx('text-xs font-bold px-2 py-0.5 rounded', cfg.badge)}>
          {indicator.score}/{indicator.maxScore}
        </span>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-gray-100 rounded-full mb-4 overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-700', cfg.bar)}
          style={{ width: `${indicator.percentage}%` }}
        />
      </div>

      {/* Issues */}
      {indicator.issues.length > 0 && (
        <ul className="space-y-1 mb-3">
          {indicator.issues.map((issue, i) => (
            <li key={i} className="flex gap-2 text-xs text-gray-600">
              <span className="text-red-400 mt-0.5 shrink-0">✗</span>
              <span>{issue}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Strengths */}
      {indicator.strengths.length > 0 && (
        <ul className="space-y-1">
          {indicator.strengths.map((s, i) => (
            <li key={i} className="flex gap-2 text-xs text-gray-500">
              <span className="text-green-500 mt-0.5 shrink-0">✓</span>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
