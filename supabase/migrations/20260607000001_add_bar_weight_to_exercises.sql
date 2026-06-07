-- Peso del bilanciere (kg) per esercizi con bilanciere/base fissa.
-- Concorre al peso totale ma è esente dall'arrotondamento dischi.
-- NULL = nessun bilanciere (trattato come 0).
alter table exercises add column bar_weight numeric;
