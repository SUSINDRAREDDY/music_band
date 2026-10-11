# Saved ABC flow review

These are the newest persisted diagnostic runs, not the later unsaved browser tests. Diagnostics were subsequently disabled. Repeated X:1 headers below were added by the parser for independently rendering each bar; they do not prove GPT restarted its tune.

## Phrase 9 — 2026-10-11T06:33:32.407Z

4 bars; instruments bass, drums, strings; input BPM 134.

```abc
X:1
M:4/4
L:1/8
Q:1/4=134
K:C
V:bass
C,2 z G, D,2 z2 |
V:drums
=C,,2 ^F,, z =D,,2 ^F,,2 |
V:strings
z2 [GCd]2 z2 [GCc]2 |

X:1
M:4/4
L:1/8
Q:1/4=134
K:C
V:bass
G,3 z D,2 z2 |
V:drums
=C,, ^F,, z ^F,, =D,,2 z ^F,, |
V:strings
z2 [GAd]4 z2 |

X:1
M:4/4
L:1/8
Q:1/4=134
K:C
V:bass
F,2 z C A,2 z2 |
V:drums
=C,,2 ^F,,2 =D,, ^F,, z ^F,, |
V:strings
[FAc]3 z z2 [GAc]2 |

X:1
M:4/4
L:1/8
Q:1/4=134
K:C
V:bass
C,2 G,2 z2 C,2 |
V:drums
=C,,2 z ^F,, =D,,2 ^F,,2 |
V:strings
z2 [GCc]4 z2 |
```

## Phrase 10 — 2026-10-11T06:33:39.610Z

4 bars; instruments bass, drums, strings; input BPM 134.

```abc
X:1
M:4/4
L:1/8
Q:1/4=134
K:C
V:bass
C,2 z G, C2 z2 |
V:drums
=C,,2 ^F,, z =D,,2 z ^F,, |
V:strings
z2 [GCc]4 z2 |

X:1
M:4/4
L:1/8
Q:1/4=134
K:C
V:bass
G,2 D,2 z2 G,2 |
V:drums
=C,, ^F,, z ^F,, =D,,2 ^F,,2 |
V:strings
[Gcd]3 z [GAd]2 z2 |

X:1
M:4/4
L:1/8
Q:1/4=134
K:C
V:bass
D,3 z A,2 E,2 |
V:drums
=C,,2 ^F,,2 =D,, ^F,, z ^F,, |
V:strings
z2 [ADd]2 z2 [Ace]2 |

X:1
M:4/4
L:1/8
Q:1/4=134
K:C
V:bass
A,2 z E, C2 A,2 |
V:drums
=C,,2 z ^F,, =D,,2 ^F,,2 |
V:strings
[Ace]4 [Gce]2 z2 |
```

## Phrase 11 — 2026-10-11T06:33:46.669Z

4 bars; instruments bass, drums, strings; input BPM 134.

```abc
X:1
M:4/4
L:1/8
Q:1/4=134
K:C
V:bass
A,2 z E, C2 G,2 |
V:drums
=C,, ^F,, z ^F,, =D,,2 ^F,,2 |
V:strings
z2 [Ace]2 [Gce]2 z2 |

X:1
M:4/4
L:1/8
Q:1/4=134
K:C
V:bass
G,2 D,2 z B, D2 |
V:drums
=C,,2 ^F,, =C,, =D,, ^F,, z ^F,, |
V:strings
[GBd]3 z z2 [GAd]2 |

X:1
M:4/4
L:1/8
Q:1/4=134
K:C
V:bass
D,2 F,2 C2 z2 |
V:drums
=C,, ^F,, z ^F,, =D,,2 z ^F,, |
V:strings
z2 [FAd]2 [FAc]3 z |

X:1
M:4/4
L:1/8
Q:1/4=134
K:C
V:bass
C,2 z G, E,2 C2 |
V:drums
=C,,2 ^F,,2 =D,, ^F,, z ^F,, |
V:strings
[EGc]2 z2 [GCd]2 [GCc]2 |
```

## Findings

The saved phrases contain four distinct bars each, not a single repeated bar. They remain short independent blocks, with no ties across blocks and little explicit long-form development in the old prompt. Repeated headers and replacing the displayed score each phrase can make the flow look disconnected. Same-thread conversation history retains prior model outputs, although previous output is not resent as a separate field.

## New inspector

The app now displays the exact serialized input passed to turn/start and the raw agent-message ABC deltas. The next request is displayed as another phrase in the same thread. Base instructions are shown separately. Musical direction is editable and sent on each request. Export log includes the last eight traced turns. No audio bytes or credentials are included in the model trace.
