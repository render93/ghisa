import { describe, expect, it, vi } from 'vitest';
import { render } from 'svelte/server';

// Importing the component alone pulls in settingsStore -> $lib/supabase, which
// instantiates the Supabase client at module load. On Node < 22 (CI) createClient
// throws because there is no native WebSocket. This test only reads the in-memory
// defaults, so we mock the module the way the other store tests do.
// vi.mock is hoisted above the imports, so the mock is active at load time.
vi.mock('$lib/supabase', () => ({ supabase: {} }));

import ExerciseForm from './ExerciseForm.svelte';

const callbacks = {
  onsave: () => {},
  oncancel: () => {}
};

describe('ExerciseForm — configurazione iniziale', () => {
  it('lascia schema, carico e step modificabili durante la creazione', () => {
    const { body } = render(ExerciseForm, {
      props: { exercise: {}, ...callbacks }
    });

    expect(body).not.toContain('readonly');
    expect(body).not.toContain('disabled');
    expect(body).not.toContain('non sono modificabili');
  });

  it.each(['wave', 'linear'] as const)(
    'blocca schema, carico e step per un esercizio %s esistente',
    (scheme) => {
      const { body } = render(ExerciseForm, {
        props: {
          exercise: {
            id: 'existing',
            name: 'Test',
            scheme,
            restSeconds: 120,
            waveBaseLoad: 30,
            linearCurrentLoad: 30,
            plateRounding: 5,
            barWeight: 20
          },
          ...callbacks
        }
      });

      expect(body).toContain('disabled');
      expect(body.match(/readonly/g)).toHaveLength(2);
      expect(body).toContain('Schema, carico iniziale e step vengono definiti alla creazione');
    }
  );
});
