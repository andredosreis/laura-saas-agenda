function MarcaiLogo({ width = 400, height = 120, className = '' }) {
  return (
    <svg
      width={width}
      height={height}
      viewBox="0 0 400 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="marcaaiGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>

      {/* Ícone calendário */}
      <g transform="translate(10, 10)">
        {/* Corpo do calendário */}
        <rect
          x="15" y="20" width="60" height="55" rx="12"
          fill="#6366f1" fillOpacity="0.08"
          stroke="url(#marcaaiGradient)" strokeWidth="2.5"
        />

        {/* Pins do calendário */}
        <line x1="30" y1="12" x2="30" y2="26" stroke="url(#marcaaiGradient)" strokeWidth="3" strokeLinecap="round" />
        <line x1="60" y1="12" x2="60" y2="26" stroke="url(#marcaaiGradient)" strokeWidth="3" strokeLinecap="round" />

        {/* Linha separadora do header */}
        <line x1="15" y1="38" x2="75" y2="38" stroke="url(#marcaaiGradient)" strokeWidth="2" strokeLinecap="round" />

        {/* Checkmark */}
        <polyline
          points="30,58 40,68 61,48"
          stroke="url(#marcaaiGradient)" strokeWidth="4"
          strokeLinecap="round" strokeLinejoin="round"
          fill="none"
        />

        {/* Sparkle grande */}
        <path
          d="M 82 8 Q 86 16 94 20 Q 86 24 82 32 Q 78 24 70 20 Q 78 16 82 8 Z"
          fill="url(#marcaaiGradient)" opacity="0.9"
        />

        {/* Sparkle pequena */}
        <path
          d="M 94 36 Q 96 40 100 42 Q 96 44 94 48 Q 92 44 88 42 Q 92 40 94 36 Z"
          fill="url(#marcaaiGradient)" opacity="0.7"
        />
      </g>

      {/* "marca" */}
      <text
        x="118" y="72"
        fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        fontSize="46" fontWeight="800" fill="#1e293b" letterSpacing="-2"
      >
        marca
      </text>

      {/* "ai" em gradiente */}
      <text
        x="285" y="72"
        fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        fontSize="46" fontWeight="800" letterSpacing="-2"
        fill="#6366f1"
      >
        ai
      </text>

      {/* Subtítulo */}
      <text
        x="122" y="94"
        fontFamily="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif"
        fontSize="11" fontWeight="600" fill="#94a3b8" letterSpacing="2.5"
      >
        SMART AGENDA
      </text>
    </svg>
  );
}

export default MarcaiLogo;
