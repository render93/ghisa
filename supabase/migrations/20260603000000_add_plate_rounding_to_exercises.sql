-- Override opzionale del passo di arrotondamento dischi, per singolo esercizio.
-- NULL = usa il default dello schema (settings.plateRoundingWave / plateRoundingLinear).
alter table exercises add column plate_rounding numeric;
