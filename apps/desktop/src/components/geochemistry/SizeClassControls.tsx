/** "Tamaño por clases" panel: the size channel of the shared value-class controls (see ClassControls.tsx). */
import ClassControls from './ClassControls';

export default function SizeClassControls({ compact = false }: { compact?: boolean }) {
  return <ClassControls kind="size" compact={compact} />;
}
