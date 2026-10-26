import {
  cast,
  createPuppet,
  posePuppet,
} from '/vendor/paper-doodle/puppets.mjs';

export function createStage(
  container,
  {
    clock = () => performance.now() / 1000,
    onSelect = () => {},
    onPreviewChange = () => {},
  } = {},
) {
  const band = document.createElement('div');
  band.className = 'band';
  container.replaceChildren(band);
  const actors = new Map();
  let selected = [],
    events = [],
    previewUntil = 0,
    disposed = false,
    frame,
    reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const preference = matchMedia('(prefers-reduced-motion: reduce)');
  const followPreference = (e) => {
    reduced = e.matches;
  };
  preference.addEventListener('change', followPreference);
  function renderSelection() {
    const count = selected.length,
      columns = count <= 4 ? count : Math.ceil(count / 2);
    band.style.setProperty('--columns', columns);
    band.style.setProperty('--rows', Math.ceil(count / 3));
    band.classList.toggle('many', count > 4);
    band.classList.toggle('solo', count === 1);
    band.replaceChildren(
      ...cast
        .filter((c) => selected.includes(c.id))
        .map((c) => actors.get(c.id)?.element)
        .filter(Boolean),
    );
  }
  const ready = fetch('/assets/characters/paper-doodle/bodies.json')
    .then((r) => {
      if (!r.ok) throw Error('Character assets could not load');
      return r.json();
    })
    .then((bodies) => {
      if (disposed) return;
      for (const character of cast) {
        const actor = createPuppet(character, bodies),
          element = document.createElement('button');
        element.type = 'button';
        element.className = 'doodle';
        element.setAttribute(
          'aria-label',
          `${character.name} · ${character.role}. Change instruments`,
        );
        const caption = document.createElement('span');
        caption.className = 'doodle-caption';
        caption.append(document.createTextNode(character.name));
        const role = document.createElement('small');
        role.textContent = character.role;
        caption.append(role);
        element.append(actor.svg, caption);
        element.onclick = () => onSelect(character.id);
        actor.element = element;
        actors.set(character.id, actor);
      }
      renderSelection();
    })
    .catch((e) => {
      const error = document.getElementById('stageError');
      if (error) error.textContent = e.message;
      console.error(e);
    });
  function animate() {
    if (disposed) return;
    frame = requestAnimationFrame(animate);
    if (document.hidden) return;
    const audioTime = clock(),
      time = performance.now() / 1000,
      due = new Map();
    if (previewUntil && time >= previewUntil) {
      previewUntil = 0;
      onPreviewChange(false);
    }
    if (previewUntil)
      for (const id of selected) due.set(id, { time, duration: 0.1 });
    events.sort((a, b) => a.time - b.time);
    while (events.length && events[0].time <= audioTime) {
      const event = events.shift();
      if (!selected.includes(event.instrument) || audioTime - event.time > 1)
        continue;
      const duration = Math.max(
        0.1,
        (event.duration * 60) / event.tempo - (audioTime - event.time),
      );
      const current = due.get(event.instrument);
      due.set(event.instrument, {
        time,
        duration: Math.max(duration, current?.duration ?? 0),
      });
    }
    for (const id of selected) {
      const actor = actors.get(id);
      if (!actor) continue;
      posePuppet(actor, time, due.get(id) ?? null, null, reduced);
      actor.element.dataset.playing = actor.svg.dataset.playing;
    }
  }
  animate();
  return {
    ready,
    select(ids) {
      selected = ids.filter((id) => cast.some((c) => c.id === id));
      events = events.filter((e) => selected.includes(e.instrument));
      for (const [id, actor] of actors)
        if (!selected.includes(id))
          actor.activity = {
            since: 0,
            until: 0,
            lastEventTime: null,
            clip: null,
            previous: null,
          };
      renderSelection();
    },
    note(n, time, tempo = 100) {
      events.push({ ...n, time, tempo });
    },
    preview() {
      if (previewUntil) {
        this.reset();
        return;
      }
      previewUntil = performance.now() / 1000 + 10;
      onPreviewChange(true);
    },
    reset() {
      events = [];
      if (previewUntil) {
        previewUntil = 0;
        onPreviewChange(false);
      }
      for (const actor of actors.values()) {
        actor.activity = {
          since: 0,
          until: 0,
          lastEventTime: null,
          clip: null,
          previous: null,
        };
        actor.lastPose = -Infinity;
      }
    },
    reduce(value) {
      reduced = value;
    },
    view() {},
    resetView() {},
    dispose() {
      disposed = true;
      cancelAnimationFrame(frame);
      preference.removeEventListener('change', followPreference);
      container.replaceChildren();
    },
  };
}
