"""Only implemented and explicitly scoped tools appear in this catalog."""
REE = ['La','Ce','Pr','Nd','Sm','Eu','Gd','Tb','Dy','Ho','Er','Tm','Yb','Lu']
TRACE = ['Cs','Rb','Ba','Th','U','Nb','Ta','La','Ce','Pb','Pr','Sr','Nd','Zr','Hf','Sm','Eu','Gd','Tb','Dy','Y','Ho','Er','Tm','Yb','Lu']
FROST = 'Frost et al. (2001), doi:10.1093/petrology/42.11.2033. Índices; sin campos discriminantes automáticos.'
SM89 = 'Sun & McDonough (1989), doi:10.1144/GSL.SP.1989.042.01.19. Referencias ppm incluidas mediante pyrolite.'


def tool(id, label, group, inputs, kind='scatter', unit='pct', formula='', reference='', optional=False):
    return dict(id=id, label=label, group=group, inputs=inputs, kind=kind,
                unit=unit, formula=formula, reference=reference or formula, optional_inputs=optional)


TOOLS = [
    tool('line','Líneas XY','diagrams',['X','Y'],'line','raw','Observaciones ordenadas por X dentro de cada grupo; no se conectan grupos distintos.'),
    tool('qq-normal','Q–Q normal','diagrams',['X'],'qq','raw','Valores ordenados frente a Φ⁻¹((i−0.5)/n), por grupo. No constituye por sí solo una prueba de normalidad.'),
    tool('probability','Probabilidad normal','diagrams',['X'],'probability','raw','Valor observado frente al cuantil normal de (i−0.5)/n; eje de probabilidad no lineal.'),
    tool('ecdf','Probabilidad acumulada (ECDF)','diagrams',['X'],'ecdf','raw','F(x)=número de observaciones ≤x / n; los empates comparten probabilidad.'),
    tool('assay-compare','Comparación de ensayes XY','diagrams',['X','Y'],'assay','raw','Pares de ensayes de la misma muestra e intervalo, en la misma unidad; línea de identidad 1:1.'),
    tool('assay-difference','Diferencias de ensayes','diagrams',['X','Y'],'difference','raw','Diferencia Y−X frente a media (X+Y)/2. Cada fila debe representar la misma muestra e intervalo.'),
    tool('downhole','Downhole · perfil por sondaje','diagrams',['Depth','Value'],'downhole','raw','Valor frente a profundidad medida, creciente hacia abajo. Selecciona el ID del sondaje como grupo. No desurvey ni compositado.'),
    tool('downhole-compare','Downhole · comparar ensayes','diagrams',['Depth','Assay1','Assay2'],'downhole','raw','Dos ensayes por fila a la misma profundidad; perfiles separados por sondaje. Confirmar unidades comparables.'),
    tool('scatter','Dispersión XY','diagrams',['X','Y'],unit='raw',formula='Pares de observaciones X e Y; sin imputación.'),
    tool('histogram','Histograma','diagrams',['X'],'histogram','raw','Frecuencias de observaciones válidas; intervalos calculados por Plotly.'),
    tool('boxplot','Tukey · cajas y bigotes','diagrams',['X'],'box','raw','Cuartiles lineales; bigotes hasta 1.5 IQR, mediana y puntos originales. Los valores extremos no se eliminanan.'),
    tool('ternary','Ternario ABC','diagrams',['A','B','C'],'ternary','raw','100 × componente / (A+B+C). Componentes no negativos y de la misma unidad.'),
    tool('harker','Harker · SiO2 vs óxido','diagrams',['SiO2','Oxide'],formula='Óxido mayor (wt%) frente a SiO2 (wt%).'),
    tool('tas','TAS · clasificación volcánica','lithogeochemistry',['SiO2','Na2O','K2O'],formula='Na2O + K2O frente a SiO2 (wt% anhidro).',reference='Le Maitre (2002), doi:10.1017/CBO9780511535581. Polígonos combinados pyrolite; T1/T2 y tefrita/basanita requieren criterios adicionales.'),
    tool('qapf','QAPF · proyección modal','lithogeochemistry',['Q','A','P','F'],'qapf',formula='Normalización de Q-A-P o F-A-P al 100%. Proporciones modales; NO calcula norma CIPW ni asigna nombres de roca.',reference='Streckeisen (1974), doi:10.1007/BF01820841. Proyección modal, aplicable solo con M < 90%; verificar petrográficamente.'),
    tool('afm','AFM · proyección','lithogeochemistry',['Na2O','K2O','FeTotal','MgO'],'ternary',formula='A=Na2O+K2O, F=FeO total, M=MgO; cierre al 100%. Sin frontera tectónica.'),
    tool('k2o-sio2','K2O–SiO2','lithogeochemistry',['SiO2','K2O'],formula='K2O vs SiO2 (wt%); sin clasificación de series potásicas.'),
    tool('mali','MALI','lithogeochemistry',['SiO2','Na2O','K2O','CaO'],formula='Na2O + K2O − CaO (wt%) vs SiO2.',reference=FROST),
    tool('fe-index','Fe-index','lithogeochemistry',['SiO2','FeTotal','MgO'],formula='FeOT / (FeOT + MgO) vs SiO2. Fe2O3T → FeOT: × 0.8998.',reference=FROST),
    tool('shand-index','Shand · A/CNK vs A/NK','lithogeochemistry',['Al2O3','CaO','Na2O','K2O'],formula='Cocientes molares de óxidos A/CNK y A/NK; sin corrección de apatita.',reference='Shand: Al2O3/(CaO+Na2O+K2O) y Al2O3/(Na2O+K2O), en moles de óxido; no equivale al ASI corregido por P.'),
    tool('a-cnk','A/CNK','lithogeochemistry',['Al2O3','CaO','Na2O','K2O'],formula='(Al2O3/101.9613) / (CaO/56.0774 + Na2O/61.9789 + K2O/94.196).'),
    tool('a-nk','A/NK','lithogeochemistry',['Al2O3','Na2O','K2O'],formula='(Al2O3/101.9613) / (Na2O/61.9789 + K2O/94.196).'),
    tool('ree-normalization','REE · condrito SM89','lithogeochemistry',REE,'spider','ppm','Concentración / condrito SM89. Sin Pm; al menos dos elementos.',SM89,True),
    tool('primitive-mantle','Multielementos · manto primitivo SM89','lithogeochemistry',TRACE,'spider','ppm','Concentración / manto primitivo SM89. Al menos dos elementos.',SM89,True),
    tool('element-ratios','Razón elemental','lithogeochemistry',['numerator','denominator'],unit='ppm',formula='Numerador / denominador, tras convertir ambos a ppm.'),
    tool('fertility-sr-y','Sr/Y','lithogeochemistry',['Sr','Y'],unit='ppm',formula='Sr/Y. Cociente bruto; no diagnostica fertilidad por sí solo.'),
    tool('fertility-la-yb','La/Yb','lithogeochemistry',['La','Yb'],unit='ppm',formula='La/Yb. Cociente bruto; no normalizado.'),
    tool('fertility-dy-yb','Dy/Yb','lithogeochemistry',['Dy','Yb'],unit='ppm',formula='Dy/Yb. Cociente bruto; no normalizado.'),
    tool('fertility-eu-eu','Eu/Eu*','lithogeochemistry',['Sm','Eu','Gd'],unit='ppm',formula='Eu_N / √(Sm_N × Gd_N), N = condrito SM89.',reference=SM89),
    tool('fertility-ce-ce','Ce/Ce*','lithogeochemistry',['La','Ce','Pr'],unit='ppm',formula='Ce_N / √(La_N × Pr_N), N = condrito SM89. Interpolación geométrica explícita.',reference=SM89),
    tool('alteration','Alteración · AI–CCPI','mineral-exploration',['MgO','K2O','Na2O','CaO','FeTotal'],formula='AI=100(MgO+K2O)/(MgO+K2O+Na2O+CaO); CCPI=100(MgO+FeOT)/(MgO+FeOT+Na2O+K2O).',reference='Large et al. (2001), doi:10.2113/gsecongeo.96.5.957. Índices; sin diagnóstico automático ni campos minerales.'),
]
BY_ID = {item['id']: item for item in TOOLS}
