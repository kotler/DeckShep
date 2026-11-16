# DeckShep

DeckShep presents agent navigation and controls on a Stream Deck.

## Language

**Herdr App observation source** is the reader supplying Herdr App’s reported
pane roster and selection. Reports belong to that source’s lifetime and expire
when it is retired.

**Herdr App roster** is the stable order of agent slots on the Herdr App profile.
A bank is a group of five slots shown together. A confirmed deck selection
reveals the chosen agent’s bank and sets the starting point for Next. The
selection dot follows the pane Herdr App reports.

**Rex settings observation** is the settings information DeckShep can show for
the agent in the focused Rex pane. A caption can remain visible through a brief
redraw. A settings press requires fresh evidence from the pane.
