interface Props {
  label: string;
  icon: string;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
}

export default function ActionButton({ label, icon, disabled = false, onClick, title }: Props) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      title={title}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-zinc-800 border border-zinc-700 transition-colors
        enabled:hover:bg-zinc-700 enabled:hover:border-zinc-600 enabled:text-zinc-300
        disabled:opacity-40 disabled:cursor-not-allowed disabled:text-zinc-500"
    >
      <span>{icon}</span>
      {label}
    </button>
  );
}
