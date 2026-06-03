-- Override opzionale del numero di passi di incremento per advance, per singolo esercizio.
-- NULL = usa il default globale (settings.linearIncrementSteps).
alter table exercises add column linear_increment_steps integer;
