import type { DimensionScore } from '@/types/scan';
import clsx from 'clsx';

interface Props {
  indicator: DimensionScore;
}

const verdictConfig = {
  good:    { bar: 'bg-green-500',  text: 'text-green-600',  badge: 'bg-green-50 text-green-700'   },
  average: { bar: 'bg-orange-400', text: 'text-orange-500', badge: 'bg-orange-50 text-orange-700' },
  poor:    { bar: 'bg-red-500',    text: 'text-red-600',    badge: 'bg-red-50 text-red-700'       },
};

export default function IndicatorCard({ indicator }: Props) {
  const cfg = verdictConfig[indicator.verdict];

  // Collect all issues + strengths from applicable subcriteria
  const issues    = indicator.subScores.filter(s => !s.notApplicable).flatMap(s => s.issues);
  const strengths = indicator.subScores.filter(s => !s.notApplicable).flatMap(s => s.strengths);

  return (
    <div className="card p-5 animate-fade-in flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-sm text-gray-800">{indicator.label}</h3>
        <span className={clsx('text-xs font-bold px-2 py-0.5 rounded', cfg.badge)}>
          {indicator.score}/{indicator.maxScore}
        </span>
      </div>

      {/* Dimension bar */}
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all duration-700', cfg.bar)}
          style={{ width: `${indicator.percentage}%` }}
        />
      </div>

      {/* Sub-scores */}
      <div className="space-y-1.5">
        {indicator.subScores.map((s) => {
          const pct = s.notApplicable ? 100 : s.maxScore > 0 ? Math.round((s.score / s.maxScore) * 100) : 0;
          const subVerdict = s.notApplicable ? 'good' : pct >= 70 ? 'good' : pct >= 40 ? 'average' : 'poor';
          const subCfg = verdictConfig[subVerdict];
          return (
            <div key={s.key} className="flex items-center gap-2">
              <span className="text-[11px] text-gray-500 w-36 shrink-0 truncate">{s.label}</span>
              {s.notApplicable ? (
                <span className="text-[10px] text-gray-400 italic">N/v.t.</span>
              ) : (
                <>
                  <div className="flex-1 h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={clsx('h-full rounded-full', subCfg.bar)}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className={clsx('text-[10px] font-semibold w-12 text-right shrink-0', subCfg.text)}>
                    {s.score}/{s.maxScore}
                  </span>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Issues */}
      {issues.length > 0 && (
        <ul className="space-y-1">
          {issues.slice(0, 2).map((issue, i) => (
            <li key={i} className="flex gap-2 text-xs text-gray-600">
              <span className="text-red-400 mt-0.5 shrink-0">✗</span>
              <span>{issue}</span>
            </li>
          ))}
        </ul>
      )}

      {/* Strengths */}
      {strengths.length > 0 && issues.length === 0 && (
        <ul className="space-y-1">
          {strengths.slice(0, 1).map((s, i) => (
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
