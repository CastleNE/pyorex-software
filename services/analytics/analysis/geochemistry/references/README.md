# Local scientific reference data

Downloaded unchanged on 2026-09-19 from morganjwilliams/pyrolite commit
`ab651b448ecd2ce1bc22d752b80a977a1f4dd1ca`:

- tas.json: pyrolite/data/models/TAS/config_lemaitre_combined.json
- chondrite.csv: pyrolite/data/geochem/refcomp/CH_SunMcDonough1989.csv
- primitive_mantle.csv: pyrolite/data/geochem/refcomp/PM_SunMcDonough1989.csv
- LICENSE-pyrolite.txt: full upstream licence, retained with distributions.

Source repository: https://github.com/morganjwilliams/pyrolite/tree/ab651b448ecd2ce1bc22d752b80a977a1f4dd1ca

TAS polygons are the combined Le Maitre model, not an independently digitized
dataset. Volcanic labels are used; U1 is displayed as Tephrite / Basanite because
normative olivine is not calculated. T1/T2 remain combined. Points on a shared
boundary are reported explicitly; outside points receive no rock assignment.
Inputs must be appropriate anhydrous wt% whole-rock chemistry.

Normalization references contain values in ppm. PyOrex converts source units
before division. Eu and Ce anomalies use the explicitly documented geometric
interpolations; fertility is not inferred automatically from any ratio.

No affiliation or endorsement by CSIRO or pyrolite is implied.
