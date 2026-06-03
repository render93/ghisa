-- Salto di un'intera seduta: riga workouts con skipped=true e nessuna entry.
alter table workouts add column skipped boolean not null default false;
alter table workouts add column note text;

-- Salto di un singolo esercizio dentro una seduta svolta.
alter table workout_entries add column skipped boolean not null default false;
