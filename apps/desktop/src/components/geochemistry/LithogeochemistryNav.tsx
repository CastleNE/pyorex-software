import ToolFamilyNav from './ToolFamilyNav';
import {LITHOGEOCHEMISTRY_MODULE,lithoFamilyLabel} from '../../lib/geochemistry-registry';

const LABELS={family:{es:'Familia de litogeoquímica',en:'Lithogeochemistry family'},tool:{es:'Herramienta geoquímica',en:'Geochemical tool'}};

/** LITOGEOQUÍMICA-specific shell over the reusable `ToolFamilyNav` (see ToolFamilyNav.tsx and DiagramsNav.tsx, its
 * DIAGRAMS counterpart) — same navigation component, module=lithogeochemistry and Spanish family labels. */
export default function LithogeochemistryNav() {
  return <ToolFamilyNav module={LITHOGEOCHEMISTRY_MODULE} familyLabel={lithoFamilyLabel} labels={LABELS}/>;
}
