export const reactionNames = {
  pluck: ['Tiny pogo', 'Windmill strum', 'Dramatic bow', 'Side-step superstar'],
  keys: [
    'Typewriter paws',
    'Jazz hands',
    'Squishy delight',
    'Hello, audience!',
  ],
  drums: [
    'Floppy drumroll',
    'Stick tornado',
    'Silly salute',
    'Bunny drum bounce',
  ],
  bass: ['Sleepy swagger', 'Cool lean', 'Shy little wave', 'Happy heel bounce'],
};

// A shuffled bag visits every move before refilling, with no adjacent repeats.
export function nextReaction(actor) {
  const random = actor.random ?? Math.random;
  const pool = (actor.reactionPool ??= { bag: [], last: null });
  if (!pool.bag.length) {
    pool.bag = [0, 1, 2, 3];
    for (let i = 3; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [pool.bag[i], pool.bag[j]] = [pool.bag[j], pool.bag[i]];
    }
    if (pool.bag.at(-1) === pool.last) {
      const j = Math.floor(random() * 3);
      [pool.bag[3], pool.bag[j]] = [pool.bag[j], pool.bag[3]];
    }
  }
  pool.last = pool.bag.pop();
  return pool.last;
}

export function choreography(id, index, seconds, side = 1) {
  const t = seconds,
    s = Math.sin,
    h = (speed, amount) => Math.max(0, s(t * speed)) * amount;
  const p = {
    tilt: 0,
    hop: 0,
    squash: 1,
    kick: 0,
    left: [179, 130],
    right: [100, 206],
    stickLeft: -2.3,
    stickRight: -0.65,
    face: index === 2 ? 'wink' : 'grin',
  };
  if (id === 'pluck') {
    if (index === 0) {
      p.hop = h(5.4, 16);
      p.tilt = s(t * 5.4) * 3;
      p.right = [100, 206 + s(t * 12) * 14];
    }
    if (index === 1) {
      p.tilt = s(t * 3) * 6;
      p.right = [104 + Math.cos(t * 6) * 22, 185 + s(t * 6) * 24];
    }
    if (index === 2) {
      p.tilt = h(2.8, 13) * side;
      p.squash = 1 - h(2.8, 0.065);
      p.left = [179, 130 + h(2.8, 7)];
      p.right = [102, 204 + h(2.8, 9)];
    }
    if (index === 3) {
      p.tilt = s(t * 4) * 9;
      p.kick = s(t * 4) * 22;
      p.hop = h(4, 6);
      p.right = [100 + s(t * 8) * 7, 206 + s(t * 8) * 10];
    }
  }
  if (id === 'keys') {
    p.left = [83, 184];
    p.right = [155, 184];
    if (index === 0) {
      p.left = [83 + s(t * 4) * 20, 184 + h(10, 16)];
      p.right = [
        155 + Math.cos(t * 4) * 18,
        184 + Math.max(0, Math.cos(t * 10)) * 16,
      ];
      p.tilt = s(t * 5) * 2;
    }
    if (index === 1) {
      p.left = [54 + s(t * 8) * 8, 106 + s(t * 5) * 11];
      p.right = [185 + Math.cos(t * 8) * 8, 106 + Math.cos(t * 5) * 11];
      p.tilt = s(t * 3) * 4;
      p.face = 'surprised';
    }
    if (index === 2) {
      p.squash = 1 - h(5, 0.1);
      p.left = [78, 182 + h(5, 18)];
      p.right = [156, 182 + h(5, 18)];
      p.tilt = s(t * 2) * 2;
    }
    if (index === 3) {
      p.right = [185 + s(t * 9) * 12, 92 + Math.cos(t * 5) * 8];
      p.left = [83, 190];
      p.tilt = s(t * 3) * 3;
      p.face = 'wink';
    }
  }
  if (id === 'drums') {
    p.left = [69, 161];
    p.right = [164, 144];
    if (index === 0) {
      p.left = [69, 161 + s(t * 12) * 20];
      p.right = [164, 144 + Math.cos(t * 12) * 21];
      p.stickLeft += s(t * 12) * 0.8;
      p.stickRight += Math.cos(t * 12) * 0.8;
      p.tilt = s(t * 6) * 3;
    }
    if (index === 1) {
      p.left = [69 + s(t * 5) * 10, 146];
      p.right = [164 + Math.cos(t * 5) * 10, 135];
      p.stickLeft += t * 10;
      p.stickRight -= t * 10;
      p.tilt = s(t * 3) * 5;
      p.face = 'surprised';
    }
    if (index === 2) {
      p.left = [81, 90 + h(3, 8)];
      p.right = [166, 145];
      p.stickLeft = -0.3;
      p.stickRight = -0.9;
      p.tilt = s(t * 3) * 4;
      p.face = 'wink';
    }
    if (index === 3) {
      p.squash = 1 - h(5, 0.085);
      p.left = [60, 137 - h(5, 18)];
      p.right = [176, 117 - h(5, 18)];
      p.stickLeft = -1.5;
      p.stickRight = -1.65;
      p.tilt = s(t * 5) * 2;
    }
  }
  if (id === 'bass') {
    p.left = [178, 106];
    p.right = [97, 212];
    if (index === 0) {
      p.tilt = s(t * 3.2) * 8;
      p.right = [97 + s(t * 6) * 4, 212 + Math.cos(t * 6) * 5];
    }
    if (index === 1) {
      p.tilt = (7 + h(2.5, 6)) * side;
      p.left = [174, 110];
      p.right = [94, 207];
      p.face = 'wink';
    }
    if (index === 2) {
      p.right = [58 + s(t * 8) * 12, 96 + Math.cos(t * 4) * 6];
      p.tilt = s(t * 2.5) * 4;
      p.face = 'wink';
    }
    if (index === 3) {
      p.hop = h(4, 8);
      p.kick = s(t * 4) * 15;
      p.tilt = s(t * 4) * 3;
      p.right = [98, 212 + s(t * 7) * 6];
    }
  }
  return p;
}
