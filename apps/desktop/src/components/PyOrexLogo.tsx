interface Props {
  size?: number;
}

export default function PyOrexLogo({ size = 28 }: Props) {
  return (
    <div className="flex items-center gap-2 py-2">
      {/* Network graph icon — recreado del logo oficial */}
      <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
        {/* Connections */}
        <line x1="14" y1="4" x2="9" y2="10" stroke="#60a5fa" strokeWidth="1.2" />
        <line x1="14" y1="4" x2="19" y2="10" stroke="#60a5fa" strokeWidth="1.2" />
        <line x1="9" y1="10" x2="14" y2="14" stroke="#60a5fa" strokeWidth="1.2" />
        <line x1="19" y1="10" x2="14" y2="14" stroke="#60a5fa" strokeWidth="1.2" />
        <line x1="9" y1="10" x2="5" y2="16" stroke="#60a5fa" strokeWidth="1.2" />
        <line x1="19" y1="10" x2="23" y2="16" stroke="#60a5fa" strokeWidth="1.2" />
        <line x1="14" y1="14" x2="9" y2="18" stroke="#60a5fa" strokeWidth="1.2" />
        <line x1="14" y1="14" x2="19" y2="18" stroke="#60a5fa" strokeWidth="1.2" />
        <line x1="5" y1="16" x2="9" y2="18" stroke="#60a5fa" strokeWidth="1.2" />
        <line x1="23" y1="16" x2="19" y2="18" stroke="#60a5fa" strokeWidth="1.2" />
        <line x1="9" y1="18" x2="14" y2="24" stroke="#60a5fa" strokeWidth="1.2" />
        <line x1="19" y1="18" x2="14" y2="24" stroke="#60a5fa" strokeWidth="1.2" />
        {/* Nodes */}
        <circle cx="14" cy="4" r="2.2" fill="#3b82f6" />
        <circle cx="9" cy="10" r="2.2" fill="#3b82f6" />
        <circle cx="19" cy="10" r="2.2" fill="#3b82f6" />
        <circle cx="5" cy="16" r="2.2" fill="#3b82f6" />
        <circle cx="14" cy="14" r="2.2" fill="#60a5fa" />
        <circle cx="23" cy="16" r="2.2" fill="#3b82f6" />
        <circle cx="9" cy="18" r="2.2" fill="#3b82f6" />
        <circle cx="19" cy="18" r="2.2" fill="#3b82f6" />
        <circle cx="14" cy="24" r="2.2" fill="#3b82f6" />
      </svg>

      {/* Divider */}
      <div className="h-5 w-px bg-zinc-600" />

      {/* Wordmark */}
      <span className="text-sm font-bold tracking-wide text-zinc-100">
        PyOre<span className="text-blue-400">X</span>
      </span>
    </div>
  );
}
