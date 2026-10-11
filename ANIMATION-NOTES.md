# Music animation implementation

Research references:
- https://threejs.org/docs/pages/CCDIKSolver.html — target-driven skeletal IK; the current procedural meshes use a simpler two-segment elbow construction, not CCD or anatomically constrained IK.
- https://threejs.org/manual/pages/animation-system.html — authored clips, tracks and animation mixers; useful for a future rigged GLB replacement.
- https://www.yamaha.com/en/musical_instrument_guide/drums/selection/ — impact technique and relaxed grip.
- https://usa.yamaha.com/files/download/other_assets/6/1165226/Mallet_Resource_Guide2.pdf — stroke preparation and rebound.

Current implementation uses the actual audio scheduling timestamps, independent of render frame rate. Keyboard notes depress corresponding modeled keys (C3–C5); hands divide at middle C. Guitar and bass choose a plausible string/fret from standard tuning, preferring fifth position. This is an approximate single-note pose, not a complete chord fingering solver. Drum notes route separately to snare/toms and cymbals, with kick-foot motion and decaying cymbal wobble. Simultaneous left/right events are evaluated independently. Sustained events remain available for their full duration. Reduced motion suppresses expressive gestures.

Added hair tufts, brows, glasses, jacket seams, buttons, pockets, fingers, shoe details, guitar frets/inlays/pegs/bridge/strap, drum rims/lugs/stands, flute keys, and keyboard controls. Limitations: no authored skeletal clips, no anatomically constrained IK, no perfect polyphonic fingering, string and flute gestures are stylized. Existing voices outside the visible keyboard range remain audible without falsely depressing an unrelated key.
