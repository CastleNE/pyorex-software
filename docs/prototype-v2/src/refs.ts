import type { Txt } from './i18n';

/* Reference cards. Sample content for the prototype: citations are the classic sources for each tool;
 * interpretations are deliberately short and qualitative and must be curated against the source before release. */
export interface RefCard { title: Txt; formula?: string; what: Txt; refs: string[]; interp: Txt; cases?: Txt[]; caveats: Txt }

export const REFS: Record<string, RefCard> = {
  tas: {
    title: { es: 'TAS · álcalis totales vs sílice', en: 'TAS · total alkali vs silica' }, formula: 'Na2O + K2O  vs  SiO2  (wt%)',
    what: { es: 'Clasificación química de rocas ígneas por sílice y álcalis totales.', en: 'Chemical classification of igneous rocks by silica and total alkalis.' },
    refs: ['Middlemost, E. A. K. (1994). Naming materials in the magma/igneous rock system. Earth-Science Reviews, 37, 215–224.', 'Le Bas, M. J., Le Maitre, R. W., Streckeisen, A., & Zanettin, B. (1986). A chemical classification of volcanic rocks based on the total alkali–silica diagram. Journal of Petrology, 27, 745–750.'],
    interp: { es: 'La versión plutónica de Middlemost permite nombrar intrusivos con la misma lógica que el TAS volcánico. Úsala con análisis recalculados al 100 % en base anhidra.', en: 'Middlemost\'s plutonic version names intrusive rocks with the same logic as the volcanic TAS. Use analyses recalculated to 100 % on an anhydrous basis.' },
    caveats: { es: 'La alteración moviliza Na y K; revisa LOI y el índice de alteración antes de interpretar.', en: 'Alteration mobilises Na and K; check LOI and alteration indices before interpreting.' },
  },
  k2o: {
    title: { es: 'K₂O–SiO₂ · series magmáticas', en: 'K₂O–SiO₂ · magmatic series' }, formula: 'K2O  vs  SiO2  (wt%)',
    what: { es: 'Separa series toleítica, calcoalcalina, calcoalcalina alta en K y shoshonítica.', en: 'Separates tholeiitic, calc-alkaline, high-K calc-alkaline and shoshonitic series.' },
    refs: ['Peccerillo, A., & Taylor, S. R. (1976). Geochemistry of Eocene calc-alkaline volcanic rocks from the Kastamonu area, northern Turkey. Contributions to Mineralogy and Petrology, 58, 63–81.'],
    interp: { es: 'Los campos se dibujarán con el Diagram Builder; aquí se ve la tendencia de K₂O con la diferenciación.', en: 'Fields will be drawn with the Diagram Builder; here you see the K₂O trend with differentiation.' },
    caveats: { es: 'K es móvil durante la alteración potásica y sericítica.', en: 'K is mobile during potassic and sericitic alteration.' },
  },
  afm: {
    title: { es: 'AFM', en: 'AFM' }, formula: 'A = Na2O + K2O · F = FeOT · M = MgO',
    what: { es: 'Distingue tendencias toleíticas (enriquecimiento en Fe) de calcoalcalinas.', en: 'Distinguishes tholeiitic (Fe-enrichment) from calc-alkaline trends.' },
    refs: ['Irvine, T. N., & Baragar, W. R. A. (1971). A guide to the chemical classification of the common volcanic rocks. Canadian Journal of Earth Sciences, 8, 523–548.'],
    interp: { es: 'Una trayectoria que sube hacia F antes de girar hacia A indica fraccionamiento toleítico.', en: 'A path rising toward F before turning toward A indicates tholeiitic fractionation.' },
    caveats: { es: 'Depende de la base de hierro: el prototipo usa FeOT.', en: 'Depends on the iron basis: the prototype uses FeOT.' },
  },
  frost: {
    title: { es: 'MALI y Fe-index', en: 'MALI and Fe-index' }, formula: 'MALI = Na2O + K2O − CaO · Fe-index = FeOT / (FeOT + MgO)',
    what: { es: 'Clasificación geoquímica de granitoides por alcalinidad y enriquecimiento en Fe.', en: 'Geochemical classification of granitoids by alkalinity and Fe-enrichment.' },
    refs: ['Frost, B. R., Barnes, C. G., Collins, W. J., Arculus, R. J., Ellis, D. J., & Frost, C. D. (2001). A geochemical classification for granitic rocks. Journal of Petrology, 42, 2033–2048.'],
    interp: { es: 'Junto con A/CNK, separa granitoides ferrosos de magnesianos y su serie alcalina.', en: 'Together with A/CNK, separates ferroan from magnesian granitoids and their alkali series.' },
    caveats: { es: 'Pensado para rocas graníticas; no aplicar a rocas máficas.', en: 'Designed for granitic rocks; do not apply to mafic rocks.' },
  },
  shand: {
    title: { es: 'Índice de Shand', en: 'Shand index' }, formula: 'A/CNK = Al2O3 / (CaO + Na2O + K2O) · A/NK = Al2O3 / (Na2O + K2O)  (molar)',
    what: { es: 'Saturación en alúmina: metaluminoso, peraluminoso o peralcalino.', en: 'Alumina saturation: metaluminous, peraluminous or peralkaline.' },
    refs: ['Maniar, P. D., & Piccoli, P. M. (1989). Tectonic discrimination of granitoids. Geological Society of America Bulletin, 101, 635–643.'],
    interp: { es: 'Ayuda a separar granitoides tipo I de tipo S junto con la mineralogía.', en: 'Helps separate I-type from S-type granitoids together with mineralogy.' },
    caveats: { es: 'La sericitización eleva A/CNK sin cambiar la fuente del magma.', en: 'Sericitisation raises A/CNK without changing the magma source.' },
  },
  ree: {
    title: { es: 'REE normalizadas a condrito', en: 'Chondrite-normalised REE' }, formula: 'C_muestra / C_condrito',
    what: { es: 'Forma del patrón de tierras raras: pendiente LREE/HREE y anomalías de Eu y Ce.', en: 'Shape of the REE pattern: LREE/HREE slope and Eu and Ce anomalies.' },
    refs: ['Sun, S.-s., & McDonough, W. F. (1989). Chemical and isotopic systematics of oceanic basalts: implications for mantle composition and processes. Geological Society, London, Special Publications, 42, 313–345.'],
    interp: { es: 'Una pendiente fuerte con HREE bajas sugiere granate o anfíbol en la fuente o el residuo.', en: 'A steep slope with low HREE suggests garnet or amphibole in the source or residue.' },
    caveats: { es: 'Valores < LD en HREE distorsionan la pendiente.', en: 'Below-DL HREE values distort the slope.' },
  },
  eu: {
    title: { es: 'Anomalía de Eu', en: 'Eu anomaly' }, formula: 'Eu/Eu* = EuN / √(SmN · GdN)',
    what: { es: 'Mide cuánto se aparta el Eu del patrón de sus vecinas Sm y Gd.', en: 'Measures how far Eu departs from its neighbours Sm and Gd.' },
    refs: ['Sun, S.-s., & McDonough, W. F. (1989). Geological Society, London, Special Publications, 42, 313–345.'],
    interp: { es: 'Valores bajos suelen indicar fraccionamiento de plagioclasa; valores cercanos a 1 en magmas oxidados e hidratados se usan como indicador de fertilidad.', en: 'Low values usually indicate plagioclase fractionation; values near 1 in oxidised, hydrous magmas are used as a fertility indicator.' },
    caveats: { es: 'Sensible a la calidad analítica de Sm, Eu y Gd.', en: 'Sensitive to the analytical quality of Sm, Eu and Gd.' },
  },
  sry: {
    title: { es: 'Sr/Y y fertilidad de arco', en: 'Sr/Y and arc fertility' }, formula: 'Sr / Y  (ppm/ppm)',
    what: { es: 'Indicador de magmas hidratados con poco fraccionamiento de plagioclasa.', en: 'Indicator of hydrous magmas with little plagioclase fractionation.' },
    refs: ['Richards, J. P. (2011). High Sr/Y arc magmas and porphyry Cu ± Mo ± Au deposits: Just add water. Ore Geology Reviews, 40, 1–26.', 'Loucks, R. R. (2014). Distinctive composition of copper-ore-forming arc magmas. Australian Journal of Earth Sciences, 61, 5–16.'],
    interp: { es: 'Sr/Y alto se asocia a fraccionamiento de anfíbol con supresión de plagioclasa, condiciones favorables para pórfidos de Cu. Se combina con V/Sc y Eu/Eu*.', en: 'High Sr/Y is linked to amphibole fractionation with suppressed plagioclase, conditions favourable for porphyry Cu. Combine with V/Sc and Eu/Eu*.' },
    cases: [{ es: 'Arcos andinos con pórfidos de Cu (Chile y Perú)', en: 'Andean arcs hosting porphyry Cu (Chile and Peru)' }],
    caveats: { es: 'No es un criterio único: Sr/Y alto también aparece en magmas no mineralizados.', en: 'Not a stand-alone criterion: high Sr/Y also occurs in barren magmas.' },
  },
  alt: {
    title: { es: 'Alteration box plot', en: 'Alteration box plot' }, formula: 'AI = 100(MgO+K2O)/(MgO+K2O+CaO+Na2O) · CCPI = 100(MgO+FeOT)/(MgO+FeOT+Na2O+K2O)',
    what: { es: 'Intensidad y tipo de alteración: sericita y clorita frente a carbonato y pirita.', en: 'Alteration intensity and type: sericite and chlorite versus carbonate and pyrite.' },
    refs: ['Ishikawa, Y., Sawaguchi, T., Iwaya, S., & Horiuchi, M. (1976). Delineation of prospecting targets for Kuroko deposits based on modes of volcanism of underlying dacite and alteration halos. Mining Geology, 26, 105–117.', 'Large, R. R., Gemmell, J. B., Paulick, H., & Huston, D. L. (2001). The alteration box plot: a simple approach to understanding the relationship between alteration mineralogy and lithogeochemistry associated with volcanic-hosted massive sulfide deposits. Economic Geology, 96, 957–971.'],
    interp: { es: 'Las muestras que se alejan del campo de rocas frescas hacia la esquina sericita–clorita–pirita marcan los halos de alteración más intensa.', en: 'Samples moving away from the least-altered field toward the sericite–chlorite–pyrite corner mark the most intense alteration halos.' },
    caveats: { es: 'Diseñado para VMS en rocas volcánicas; en pórfidos se usa como guía cualitativa.', en: 'Designed for VMS in volcanic rocks; in porphyries use it as a qualitative guide.' },
  },
  idw: {
    title: { es: 'Interpolación IDW', en: 'IDW interpolation' }, formula: 'z(x) = Σ wᵢ zᵢ / Σ wᵢ ,  wᵢ = 1 / dᵢᵖ',
    what: { es: 'Promedio ponderado por la inversa de la distancia a las muestras vecinas.', en: 'Average weighted by the inverse distance to neighbouring samples.' },
    refs: ['Shepard, D. (1968). A two-dimensional interpolation function for irregularly-spaced data. Proceedings of the 1968 ACM National Conference, 517–524.'],
    interp: { es: 'Rápido y sin supuestos estadísticos. Una potencia alta concentra la influencia en las muestras cercanas.', en: 'Fast and free of statistical assumptions. A higher power concentrates influence on nearby samples.' },
    caveats: { es: 'Produce «ojos de buey» alrededor de muestras aisladas y no debe extrapolarse lejos de los datos: usa la máscara.', en: 'Produces bull\'s-eyes around isolated samples and must not be extrapolated far from data: use the mask.' },
  },
};
