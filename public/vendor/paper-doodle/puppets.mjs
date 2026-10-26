import { reactionNames, nextReaction, choreography } from './reactions.mjs';
// Character bodies adapted from Kenney Scribble Platformer (CC0).
// Faces, accessories, instruments and pose controls are authored for this preview.
export const cast = [
  {
    id: 'pluck',
    name: 'Pip',
    role: 'Guitar',
    color: '#FC5C65',
    shape: 'round',
    body: 'coral',
    detail: 'Coral capsule · patched strap · little hair curl',
    gesture:
      'Tiny rock-star hops, a happy wink and a gloriously oversized strum.',
  },
  {
    id: 'keys',
    name: 'Dot',
    role: 'Keys',
    color: '#9179FF',
    shape: 'square',
    body: 'lavender',
    detail: 'Lavender paper square · round glasses · tiny bow',
    gesture:
      'Bouncy typewriter paws, a shoulder wiggle and a delighted little grin.',
  },
  {
    id: 'drums',
    name: 'Tock',
    role: 'Drums',
    color: '#FFB600',
    shape: 'round',
    body: 'yellow',
    detail: 'Yellow capsule · headphones · mismatched drumsticks',
    gesture: 'A goofy drumroll, twirling sticks and headphones that bop along.',
  },
  {
    id: 'bass',
    name: 'Reed',
    role: 'Bass',
    color: '#37D98C',
    shape: 'square',
    body: 'mint',
    detail: 'Mint paper square · soft beanie · long bass neck',
    gesture: 'A lazy side-to-side groove, a shy wink and a little beanie bob.',
  },
  {
    id: 'piano',
    name: 'Cleo',
    role: 'Piano',
    color: '#ED8B65',
    shape: 'round',
    body: 'coral',
    motion: 'keys',
  },
  {
    id: 'strings',
    name: 'Fiddle',
    role: 'Strings',
    color: '#8EAAE1',
    shape: 'square',
    body: 'lavender',
    motion: 'pluck',
  },
  {
    id: 'organ',
    name: 'Ollie',
    role: 'Organ',
    color: '#BB8CBE',
    shape: 'round',
    body: 'lavender',
    motion: 'keys',
  },
  {
    id: 'vibes',
    name: 'Milo',
    role: 'Vibes',
    color: '#E8B958',
    shape: 'square',
    body: 'yellow',
    motion: 'drums',
  },
  {
    id: 'flute',
    name: 'Fern',
    role: 'Flute',
    color: '#71BDA9',
    shape: 'round',
    body: 'mint',
    motion: 'bass',
  },
  {
    id: 'lead',
    name: 'Zig',
    role: 'Synth',
    color: '#E985AA',
    shape: 'square',
    body: 'coral',
    motion: 'keys',
  },
];
const svgNS = 'http://www.w3.org/2000/svg';
const path = (d, extra = '') => `<path d="${d}" ${extra}/>`;
const ink =
  'stroke="#34332f" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"';
const white = 'fill="#fffcf3"';
function accessories(id) {
  if (id === 'piano')
    return path('M99 74 Q119 46 140 74 M103 66 L138 66', white + ' ' + ink);
  if (id === 'strings')
    return path('M86 70 Q119 54 157 72 M109 60 L135 48', 'fill="none" ' + ink);
  if (id === 'organ')
    return path(
      'M93 73 L89 51 L108 59 L120 45 L133 59 L150 52 L146 75 Z',
      white + ' ' + ink,
    );
  if (id === 'vibes') id = 'drums';
  if (id === 'flute')
    return path('M92 73 Q119 51 153 74 L136 77', white + ' ' + ink);
  if (id === 'lead')
    return path(
      'M91 78 L93 55 L111 64 L127 52 L143 66 L153 60 L151 82',
      white + ' ' + ink,
    );
  if (id === 'pluck')
    return (
      path('M111 70 Q103 47 119 51 Q135 58 124 65', 'fill="none" ' + ink) +
      path(
        'M91 132 L145 198',
        'fill="none" stroke="#514947" stroke-width="8"',
      ) +
      path('M100 146 l8 8', 'stroke="#fffcf3" stroke-width="2"')
    );
  if (id === 'keys')
    return (
      '<g fill="none" ' +
      ink +
      '><circle cx="109" cy="116" r="10"/><circle cx="133" cy="116" r="10"/>' +
      path('M119 114 L123 114') +
      '</g>' +
      path(
        'M113 65 L99 57 L99 72 Z M114 65 L128 57 L128 72 Z',
        'fill="#f2ceb9" ' + ink,
      )
    );
  if (id === 'drums')
    return (
      path(
        'M81 110 C70 55 167 52 161 111',
        'fill="none" ' + ink + ' stroke-width="5"',
      ) +
      '<rect x="73" y="99" width="11" height="24" rx="5" ' +
      white +
      ' ' +
      ink +
      '/><rect x="157" y="99" width="11" height="24" rx="5" ' +
      white +
      ' ' +
      ink +
      '/>'
    );
  return (
    path('M75 76 Q79 48 119 49 Q155 47 163 76 Z', white + ' ' + ink) +
    path(
      'M77 77 Q119 83 161 77 M91 60 L91 71 M105 55 L105 72 M121 54 L121 73 M139 57 L139 73',
      'fill="none" ' + ink,
    )
  );
}
function strings(bass) {
  const count = bass ? 4 : 6;
  return Array.from({ length: count }, (_, i) =>
    path(
      `M${101 + i * 2} 217 L${185 + i * 2} ${bass ? 95 : 112}`,
      'fill="none" stroke="#615a50" stroke-width=".7"',
    ),
  ).join('');
}
function guitar(bass) {
  return (
    '<g ' +
    ink +
    '>' +
    path(
      bass
        ? 'M106 172 Q92 157 88 175 Q82 190 72 195 Q55 217 84 236 Q110 249 127 228 Q132 210 119 200 Q130 180 116 177 Z'
        : 'M104 171 Q91 158 86 179 Q83 191 73 195 Q55 218 83 235 Q109 248 129 225 Q136 211 121 198 Q129 178 114 177 Z',
      white,
    ) +
    path(
      bass
        ? 'M103 190 L181 96 L191 103 L115 201 Z'
        : 'M106 187 L180 114 L190 122 L117 200 Z',
      'fill="#e8d8ba"',
    ) +
    path(
      bass
        ? 'M176 99 L182 81 L205 86 L194 105 Z'
        : 'M176 116 L188 103 L205 114 L192 128 Z',
      white,
    ) +
    '<ellipse cx="99" cy="211" rx="9" ry="12" fill="#34332f"/>' +
    path('M79 222 L101 232', 'fill="none"') +
    strings(bass) +
    path(
      'M180 126 l9 8 M169 138 l9 8 M158 149 l9 8 M147 161 l9 8',
      'fill="none" stroke-width="1"',
    ) +
    '</g>'
  );
}
function keyboard() {
  return (
    '<g ' +
    ink +
    '><path d="M29 191 Q112 187 211 193 L211 218 Q121 224 30 216 Z" ' +
    white +
    '/>' +
    Array.from(
      { length: 18 },
      (_, i) =>
        `<rect class="key key-${i}" x="${34 + i * 9.5}" y="194" width="9.5" height="22" fill="#fffcf3" stroke="#34332f" stroke-width="1"/>`,
    ).join('') +
    Array.from({ length: 17 }, (_, i) =>
      [2, 6, 9, 13, 16].includes(i)
        ? ''
        : `<rect x="${40 + i * 9.5}" y="193" width="5" height="12" rx="1" fill="#34332f" stroke="none"/>`,
    ).join('') +
    path('M46 222 L188 267 M192 222 L53 267', 'fill="none"') +
    '</g>'
  );
}
function drums() {
  return (
    '<g ' +
    ink +
    '>' +
    path('M194 164 L196 250 M180 252 L211 252', 'fill="none"') +
    '<ellipse class="cymbal" cx="194" cy="164" rx="29" ry="6" fill="#e6d39d"/>' +
    path('M46 197 L46 254 M31 255 L61 255', 'fill="none"') +
    '<ellipse cx="48" cy="199" rx="27" ry="12" ' +
    white +
    '/>' +
    path('M21 199 L22 220 Q48 232 74 219 L75 199', white) +
    '<ellipse class="snare" cx="48" cy="199" rx="27" ry="10" fill="#f3e3b0"/><circle cx="122" cy="225" r="39" ' +
    white +
    '/>' +
    path(
      'M122 186 Q160 186 163 225 Q162 267 122 265 Q80 264 82 225',
      'fill="none" stroke-width="1"',
    ) +
    '<text x="121" y="233" text-anchor="middle" font-family="Georgia,serif" font-style="italic" font-size="21" stroke="none" fill="#34332f">ps.</text>' +
    path('M93 254 L86 270 M150 254 L157 270', 'fill="none"') +
    '</g>'
  );
}
function instrument(id) {
  if (id === 'drums') return drums();
  if (id === 'pluck' || id === 'bass') return guitar(id === 'bass');
  if (id === 'strings')
    return (
      '<g ' +
      ink +
      '>' +
      path(
        'M99 168 Q78 164 82 184 Q93 192 82 205 Q73 230 99 235 Q124 237 123 214 Q113 203 123 190 Q130 170 109 172 Z',
        white,
      ) +
      path('M99 192 L140 115 L149 119 L108 198 Z', 'fill="#e8d8ba"') +
      path('M136 119 L143 104 L156 110 L150 124 Z', white) +
      path(
        'M89 213 L109 216 M88 203 Q80 210 88 214 M112 201 Q121 208 114 214 M94 228 L149 117',
        'fill="none" stroke-width="1"',
      ) +
      '</g>'
    );
  if (id === 'flute')
    return (
      '<g ' +
      ink +
      '>' +
      path('M57 151 L194 143 L195 153 L58 160 Z', white) +
      Array.from(
        { length: 7 },
        (_, i) =>
          '<circle cx="' +
          (89 + i * 13) +
          '" cy="152" r="2.5" fill="#e8d8ba"/>',
      ).join('') +
      path('M66 148 L66 162 M187 143 L188 154', 'fill="none"') +
      '</g>'
    );
  if (id === 'vibes')
    return (
      '<g ' +
      ink +
      '>' +
      Array.from(
        { length: 10 },
        (_, i) =>
          '<rect x="' +
          (35 + i * 17) +
          '" y="' +
          (185 - i) +
          '" width="14" height="' +
          (36 - i * 2) +
          '" rx="3" fill="#e8d8ba"/>',
      ).join('') +
      path(
        'M42 223 L48 265 M196 216 L189 265 M43 241 L193 240',
        'fill="none"',
      ) +
      '</g>'
    );
  const pipes =
    id === 'organ'
      ? '<g ' +
        ink +
        '>' +
        [65, 86, 107, 128, 149, 170]
          .map(
            (x, i) =>
              '<rect x="' +
              x +
              '" y="' +
              (158 - Math.min(i, 5 - i) * 12) +
              '" width="13" height="' +
              (35 + Math.min(i, 5 - i) * 12) +
              '" rx="5" fill="#e8d8ba"/>',
          )
          .join('') +
        '</g>'
      : '';
  const top =
    id === 'lead'
      ? '<g ' +
        ink +
        '>' +
        path('M28 192 L35 176 L203 176 L211 193 Z', 'fill="#edd1df"') +
        '<rect x="49" y="181" width="28" height="8" rx="2" fill="#d1dbc3"/>' +
        [143, 163, 183]
          .map((x) => '<circle cx="' + x + '" cy="184" r="3" ' + white + '/>')
          .join('') +
        '</g>'
      : id === 'piano'
        ? path('M29 191 Q23 161 72 168 L210 191 Z', white + ' ' + ink)
        : '';
  return pipes + top + keyboard();
}
export function createPuppet(character, bodies) {
  const source = bodies[`${character.shape}-${character.body}`];
  const body = {
    ...source,
    paths: source.paths.replace(
      /#FC5C65|#9179FF|#FFB600|#37D98C/gi,
      character.color,
    ),
  };
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 240 290');
  svg.setAttribute('role', 'img');
  svg.setAttribute(
    'aria-label',
    `${character.name}, the ${character.role.toLowerCase()} player`,
  );
  svg.dataset.actor = character.id;
  svg.innerHTML = `<title>${character.name} · ${character.role}</title><g class="performance"><g class="feet" ${ink} fill="none">${path('M100 196 Q98 232 90 256 L104 258')}${path('M139 196 Q145 230 149 256 L164 258')}</g><g class="puppet"><g class="body" transform="translate(120 70) scale(2.2) translate(-${body.cx} -442)">${body.paths}</g><g class="face"><g class="eyes" fill="#fffcf3"><ellipse cx="109" cy="115" rx="3.5" ry="4.7"/><ellipse cx="133" cy="115" rx="3.5" ry="4.7"/></g>${path('M114 129 Q120 137 127 129', 'class="mouth" fill="none" stroke="#fffcf3" stroke-width="2.4" stroke-linecap="round"')}<g class="happy-eyes" fill="none" stroke="#fffcf3" stroke-width="2.4" stroke-linecap="round" opacity="0"><path d="M104 116 Q109 109 114 116"/><path d="M128 116 Q133 109 138 116"/></g></g>${accessories(character.id)}<g class="instrument">${instrument(character.id)}</g><g class="arms" ${ink} fill="none"><path class="arm-left"/><path class="arm-right"/></g><g class="sticks" ${ink}><path class="stick-left"/><path class="stick-right"/></g><g class="hands" ${ink} fill="${character.color}"><ellipse class="hand-left" rx="7" ry="6"/><ellipse class="hand-right" rx="7" ry="6"/></g><g class="marks" fill="none" ${ink} opacity="0">${path('M198 54 Q186 40 196 36 Q204 34 207 43 Q212 34 219 40 Q225 47 208 60 Z')}<path d="M37 70 L41 60 L45 70 L55 72 L47 79 L48 89 L40 84 L32 89 L34 78 L27 73 Z"/><path d="M190 90 L190 74 L200 72 L200 84"/><ellipse cx="185" cy="91" rx="5" ry="3"/><ellipse cx="195" cy="85" rx="5" ry="3"/></g></g></g>`;
  return {
    character,
    svg,
    refs: Object.fromEntries(
      [
        'performance',
        'feet',
        'puppet',
        'eyes',
        'happy-eyes',
        'mouth',
        'arm-left',
        'arm-right',
        'hand-left',
        'hand-right',
        'stick-left',
        'stick-right',
        'marks',
      ].map((k) => [k, svg.querySelector('.' + k)]),
    ),
    keys: [...svg.querySelectorAll('.key')],
    hit: null,
    activity: {
      since: 0,
      until: 0,
      lastEventTime: null,
      clip: null,
      previous: null,
    },
    lastPose: -Infinity,
  };
}
const smooth = (x) => {
  x = Math.max(0, Math.min(1, x));
  return x * x * (3 - 2 * x);
};
const mix = (a, b, t) => a + (b - a) * t;
function startClip(actor, time, previous = null) {
  const random = actor.random ?? Math.random;
  actor.activity.previous =
    previous && actor.lastMovement
      ? { pose: structuredClone(actor.lastMovement) }
      : previous;
  actor.activity.clip = {
    index: nextReaction(actor),
    start: time,
    duration: 3.2 + random() * 2,
    speed: 0.85 + random() * 0.3,
    side: random() < 0.5 ? -1 : 1,
  };
  actor.forceShuffle = false;
}
function sampleClip(id, clip, time) {
  const p = choreography(
    id,
    clip.index,
    Math.max(0, time - clip.start) * clip.speed,
    clip.side,
  );
  p.tipLeft = [Math.cos(p.stickLeft) * 40, Math.sin(p.stickLeft) * 40];
  p.tipRight = [Math.cos(p.stickRight) * 40, Math.sin(p.stickRight) * 40];
  return p;
}
export function posePuppet(
  actor,
  seconds,
  event = null,
  _next = null,
  reduced = false,
  goofiness = 1,
) {
  const { refs, character: c, svg } = actor;
  const motion = c.motion ?? c.id;
  // Activity gates a shuffled clip library. Pitch and BPM do not control motion.
  if (!actor.activity || seconds < actor.lastPose)
    actor.activity = {
      since: 0,
      until: 0,
      lastEventTime: null,
      clip: null,
      previous: null,
    };
  const a = actor.activity;
  actor.lastPose = seconds;
  if (event && event.time <= seconds && event.time !== a.lastEventTime) {
    if (event.time >= a.until) {
      a.since = event.time;
      startClip(actor, event.time);
    }
    a.until = Math.max(
      a.until,
      event.time + Math.max(0.1, event.duration ?? 0.25) + 0.7,
    );
    a.lastEventTime = event.time;
  }
  const active = seconds >= a.since && seconds < a.until;
  if (
    active &&
    a.clip &&
    (actor.forceShuffle || seconds >= a.clip.start + a.clip.duration)
  )
    startClip(actor, seconds, a.clip);
  const age = Math.max(0, seconds - a.since),
    phase = cast.indexOf(c) * 0.7;
  const envelope = active
    ? smooth(age / 0.18) * smooth((a.until - seconds) / 0.35)
    : 0;
  const amount = reduced ? 0 : envelope * goofiness;
  const clip = a.clip ?? { index: 0, start: seconds, speed: 1, side: 1 };
  const t = Math.max(0, seconds - clip.start) * clip.speed;
  const movement = sampleClip(motion, clip, seconds);
  if (a.previous && seconds - clip.start < 0.35) {
    const old = a.previous.pose ?? sampleClip(motion, a.previous, seconds),
      blend = smooth((seconds - clip.start) / 0.35);
    for (const key of ['tilt', 'hop', 'squash', 'kick'])
      movement[key] = mix(old[key], movement[key], blend);
    for (const key of ['left', 'right', 'tipLeft', 'tipRight'])
      movement[key] = movement[key].map((v, i) => mix(old[key][i], v, blend));
  } else a.previous = null;
  actor.lastMovement = structuredClone(movement);
  const rest = choreography(motion, 0, 0);
  if (c.id === 'flute') {
    rest.left = [90, 150];
    rest.right = [158, 149];
  }
  if (c.id === 'strings') {
    rest.left = [138, 138];
    rest.right = [95, 208];
  }
  if (c.id === 'flute') {
    movement.left = [90 + Math.sin(t * 3) * 4, 150];
    movement.right = [158, 149 + Math.sin(t * 4) * 3];
  }
  if (c.id === 'strings') {
    movement.left = [138, 138];
    movement.right = [95 + Math.sin(t * 6) * 12, 208];
  }
  const left = movement.left.map((v, i) => mix(rest.left[i], v, amount));
  const right = movement.right.map((v, i) => mix(rest.right[i], v, amount));
  const tilt =
    (reduced ? 0 : Math.sin(seconds * 1.8 + phase) * 0.9) +
    movement.tilt * amount;
  const hop = movement.hop * amount,
    squash = mix(1, movement.squash, amount),
    kick = movement.kick * amount;
  refs.performance.setAttribute('transform', `translate(0 ${-hop})`);
  refs.puppet.setAttribute(
    'transform',
    `rotate(${tilt} 120 250) translate(0 ${220 * (1 - squash)}) scale(1 ${squash})`,
  );
  refs.feet.children[1].setAttribute(
    'd',
    `M139 196 Q${145 + kick * 0.3} 230 ${149 + kick} 256 L${164 + kick} 258`,
  );
  if (actor.keys.length) {
    const key = reduced ? 7 : Math.floor(t * (clip.index === 0 ? 6 : 3)) % 18;
    actor.keys.forEach((k, i) =>
      k.setAttribute(
        'fill',
        active && (reduced || clip.index !== 1) && i === key
          ? '#d7c9fa'
          : '#fffcf3',
      ),
    );
  }
  if (motion === 'drums') {
    for (const [name, hand, tip, angle] of [
      ['left', left, movement.tipLeft, -2.3],
      ['right', right, movement.tipRight, -0.65],
    ]) {
      const dx = mix(Math.cos(angle) * 40, tip[0], amount),
        dy = mix(Math.sin(angle) * 40, tip[1], amount);
      refs['stick-' + name].setAttribute(
        'd',
        `M${hand[0]} ${hand[1]} L${hand[0] + dx} ${hand[1] + dy}`,
      );
    }
  } else {
    refs['stick-left'].setAttribute('d', '');
    refs['stick-right'].setAttribute(
      'd',
      c.id === 'strings'
        ? `M${right[0] - 30} ${right[1] + 20} L${right[0] + 60} ${right[1] - 45}`
        : '',
    );
  }
  if (c.id === 'vibes') {
    for (const name of ['left', 'right']) {
      const stick = refs['stick-' + name];
      stick.setAttribute('stroke-width', '4');
    }
  }
  const blink = !reduced && (seconds + phase) % 4.8 > 4.64;
  const grin = active && !reduced && movement.face !== 'surprised';
  const wink = grin && movement.face === 'wink';
  refs.eyes.setAttribute('opacity', grin && !wink ? 0 : 1);
  refs.eyes.children[1].setAttribute('opacity', wink ? 0 : 1);
  refs['happy-eyes'].children[0].setAttribute('opacity', wink ? 0 : 1);
  refs.eyes.setAttribute(
    'transform',
    `translate(0 ${blink ? 111 : 0}) scale(1 ${blink ? 0.04 : 1})`,
  );
  refs['happy-eyes'].setAttribute('opacity', grin ? 1 : 0);
  refs.mouth.setAttribute(
    'd',
    !active
      ? 'M114 129 Q120 137 127 129'
      : !reduced && movement.face === 'surprised'
        ? 'M117 130 C112 141 130 143 127 132 C126 127 119 127 117 130 Z'
        : 'M111 128 Q120 145 131 128 Q121 133 111 128 Z',
  );
  refs.mouth.setAttribute('fill', active ? '#fffcf3' : 'none');
  for (const [side, hand, shoulder, elbow] of [
    ['left', left, [81, 141], [48, 176]],
    ['right', right, [159, 141], [187, 180]],
  ]) {
    refs['arm-' + side].setAttribute(
      'd',
      `M${shoulder[0]} ${shoulder[1]} Q${elbow[0]} ${elbow[1]} ${hand[0]} ${hand[1]}`,
    );
    refs['hand-' + side].setAttribute('cx', hand[0]);
    refs['hand-' + side].setAttribute('cy', hand[1]);
  }
  refs.marks.setAttribute('opacity', amount * 0.7);
  refs.marks.setAttribute(
    'transform',
    `translate(0 ${-Math.sin(t * 2.5) * 7 * amount})`,
  );
  svg.dataset.playing = String(active);
  svg.dataset.reaction = active ? reactionNames[motion][clip.index] : 'idle';
  actor.hit = active ? event : null;
}
