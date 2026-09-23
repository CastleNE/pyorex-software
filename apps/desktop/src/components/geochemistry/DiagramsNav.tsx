import ToolFamilyNav,{ToolFamilyNavView,type ToolFamilyNavProps} from './ToolFamilyNav';
import {DIAGRAMS_MODULE,familyLabel} from '../../lib/geochemistry-registry';

const LABELS={family:'Familia de diagrama',tool:'Herramienta geoquímica'};

/**
 * DIAGRAMS-specific shell over the reusable `ToolFamilyNav` (see ToolFamilyNav.tsx) — kept as its own module, with
 * the exact prop shape it always had, so existing DIAGRAMS call sites and tests need no changes. The 'ready' variant
 * carries no `labels` field here; `DiagramsNavView` supplies DIAGRAMS' own fixed aria-labels before delegating.
 */
export type DiagramsNavProps =
  |{status:'loading'}
  |{status:'error';message:string;retrying:boolean;onRetry:()=>void}
  |{status:'ready';families:Extract<ToolFamilyNavProps,{status:'ready'}>['families'];selectedTool:string|null;disabled:boolean;missing:string[];onSelect:(toolId:string)=>void};

export function DiagramsNavView(props:DiagramsNavProps) {
  return ToolFamilyNavView(props.status==='ready'?{...props,labels:LABELS}:props);
}

export default function DiagramsNav() {
  return <ToolFamilyNav module={DIAGRAMS_MODULE} familyLabel={familyLabel} labels={LABELS}/>;
}
