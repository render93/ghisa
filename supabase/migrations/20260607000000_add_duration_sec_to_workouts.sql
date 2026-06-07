-- Durata totale della seduta in secondi (wall-clock dall'avvio alla conferma).
-- NULL per le sedute saltate (commitSkip) e per quelle pre-feature.
alter table workouts add column duration_sec integer;
