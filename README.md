# Azeroth RPG for Foundry VTT

A d20 game system for Foundry Virtual Tabletop, set in the Warcraft III and
classic World of Warcraft era. It has D&D 5e's chassis with WFRP 4e-style
detail: hit locations and Armor Points, Success Levels, Momentum and Power,
three corruption tracks, careers, talent trees and class features.

This repository is the system's release build. It holds only what Foundry
loads.

## Install

1. In Foundry's setup screen, open **Game Systems → Install System**.
2. Paste this manifest URL and press **Install**:

   ```
   https://github.com/LesosAI/warcraft-ttrpg/releases/latest/download/system.json
   ```

3. Foundry then offers to install the four modules the system requires. Accept
   all four.
4. Create a world with **Azeroth RPG** as its system.

Updates arrive through Foundry's own update check.

## Requirements

- Foundry VTT **v14**.
- The animation modules below. The system plays its strike and spell
  animations through them. They are installed from Foundry's package
  listing, never bundled here, and each carries its own licence:

| Module | Id | Licence |
|---|---|---|
| Sequencer | `sequencer` | MIT |
| JB2A - Jules and Ben's Animated Assets - Free Content | `JB2A_DnD5e` | CC BY-NC-SA 4.0 |
| Jinker's Animated Art Pack | `jaamod` | the author's own terms |
| PSFX - Peri's Sound Effects | `psfx` | the PSFX licence |

## Notice

Warcraft, World of Warcraft and every Warcraft name, character, place and
image are trademarks or copyrights of Blizzard Entertainment, Inc. This is an
unofficial, non-commercial fan project. It is not made, endorsed or supported
by Blizzard. The MIT licence in `LICENSE` covers this project's code and does
not cover Blizzard's material.
