'use client';

interface Props {
  score: number;
  size?: number;
}

export default function ScoreGauge({ score, size = 160 }: Props) {
  const radius = (size / 2) * 0.7;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const strokeWidth = size * 0.075;
  const center = size / 2;

  const color =
    score >= 70 ? '#22C55E'
    : score >= 50 ? '#F97316'
    : '#EF4444';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-label={`Score ${score} op 100`}>
      {/* Track */}
      <circle
        cx={center} cy={center} r={radius}
        stroke="#E5E7EB" strokeWidth={strokeWidth} fill="none"
      />
      {/* Progress */}
      <circle
        cx={center} cy={center} r={radius}
        stroke={color} strokeWidth={strokeWidth} fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${center} ${center})`}
        style={{ transition: 'stroke-dashoffset 1s ease-out' }}
      />
      {/* Label */}
      <text
        x={center} y={center - 6}
        textAnchor="middle" dominantBaseline="middle"
        className="fill-gray-900 font-bold"
        style={{ fontSize: size * 0.22, fontWeight: 700 }}
      >
        {score}
      </text>
      <text
        x={center} y={center + size * 0.16}
        textAnchor="middle"
        style={{ fontSize: size * 0.09, fill: '#9CA3AF' }}
      >
        / 100
      </text>
    </svg>
  );
}
