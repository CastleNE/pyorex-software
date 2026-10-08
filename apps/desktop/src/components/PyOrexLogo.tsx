interface Props {
  size?: number;
  /** Show the "PyOreX" wordmark next to the mark. */
  wordmark?: boolean;
  className?: string;
}

/**
 * PyOreX mark — the official node-network rhombus (design system › Logos).
 * Inherits colour from `currentColor`; accent nodes use the brand teal.
 */
export default function PyOrexLogo({ size = 24, wordmark = true, className = "" }: Props) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 29.9 30.2" aria-hidden="true" className="shrink-0">
        <g stroke="currentColor" strokeWidth={1.4} opacity={0.85}>
          <line x1="6.2" y1="10.5" x2="14.6" y2="18.9" />
          <line x1="14.6" y1="18.9" x2="10.6" y2="23.1" />
          <line x1="14.6" y1="18.9" x2="18.5" y2="23.1" />
          <line x1="26.9" y1="14.8" x2="18.5" y2="23.1" />
        </g>
        <g fill="currentColor">
          <circle cx="14.6" cy="2.2" r="2.6" />
          <circle cx="10.6" cy="6.2" r="2.6" />
          <circle cx="18.5" cy="6.2" r="2.6" />
          <circle cx="6.2" cy="10.5" r="2.6" className="fill-accent" />
          <circle cx="14.6" cy="10.5" r="2.6" />
          <circle cx="22.9" cy="10.5" r="2.6" />
          <circle cx="2.2" cy="14.8" r="2.6" />
          <circle cx="18.5" cy="14.8" r="2.6" />
          <circle cx="26.9" cy="14.8" r="2.6" className="fill-accent" />
          <circle cx="6.0" cy="18.9" r="2.6" />
          <circle cx="14.6" cy="18.9" r="2.6" className="fill-accent" />
          <circle cx="10.6" cy="23.1" r="2.6" />
          <circle cx="18.5" cy="23.1" r="2.6" />
          <circle cx="14.6" cy="27.2" r="2.6" />
        </g>
      </svg>
      {wordmark && <span className="text-[15px] font-bold tracking-tight">PyOreX</span>}
    </div>
  );
}
