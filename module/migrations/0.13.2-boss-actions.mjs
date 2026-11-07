/**
 * Migration to 0.13.2 - 14 §1's Boss Actions on the Bosses a world already holds (D-809).
 *
 * D-809 built a door for every one of the 109 Boss Actions in 14 and gave every damage row a
 * type (the lead: *"The damage should be school relevant to the ability. If not relevant, use
 * physical default."*). The pack is regenerated, so a Boss dragged out afresh is right already;
 * this is the repair pass over what a world holds - its actors, the unlinked tokens on its
 * scenes and the creatures in its unlocked Actor packs (`walk.mjs`) - in 0.13.1's shape:
 *
 * - **THE OLD COPIES ARE RECORDED, NOT DERIVED.** `OLD_BOSS_ACTIONS` names, for each of the 83
 *   rows whose descriptor moved, every copy a world may hold: the 0.13.0 pack's (generated
 *   once from `git show HEAD:packs-src/bestiary/<slug>.yaml`) and the 0.13.1 audit's, written
 *   sparse against `emptyAutomation()`. A world that ran 0.13.1 holds the second; one that did
 *   not holds the first, and 0.13.1 itself now stamps the pack's copy, which this pass then
 *   finds equal and leaves.
 * - **A ROW IS RESTAMPED ONLY WHERE IT STILL HOLDS AN OLD COPY** (D-665: compared against the
 *   pack, never against `undefined`). A row equal to neither the old copies nor the pack's is a
 *   GM's own: kept, and named in the log. The use a creature has spent stays spent.
 * - **A BOSS ACTION'S COST IS WRITTEN** where 14 now marks it ×2 (The Priests Chant, Send the
 *   Hounds, Call the Amani: *every action that puts more bodies on the field carries the mark*)
 *   and the stored cost is still the old one; a GM's own cost stands.
 * - **A PACK NOT YET REBUILT STAMPS NOTHING, AND SAYS SO**, as 0.13.1 does.
 *
 * Idempotent: after one pass every stale row holds the pack's copy.
 */

import { cleanAutomation } from "../rules/ability-automation.mjs";
import { bestiaryEntryId, comparable } from "./0.13.1-bestiary-descriptors.mjs";
import { packSystems, rawSystem, walkWorld } from "./walk.mjs";

/** The pack every new descriptor is read from. */
export const BESTIARY_PACK = "azeroth-rpg.bestiary";

/** Freeze a literal all the way down. */
function deepFreeze(value) {
  if (value && typeof value === "object") {
    for (const inner of Object.values(value)) deepFreeze(inner);
    Object.freeze(value);
  }
  return value;
}

/**
 * Every Boss Action whose descriptor D-809 moved, by the creature's file in
 * `packs-src/bestiary`: the entry's `_id`, its name, each row's old copies (a list, oldest
 * first), and the costs 14 now marks ×2 (`{from, to}`).
 */
export const OLD_BOSS_ACTIONS = deepFreeze({
  "akumai": {
    "id": "XfuPd5guwzreeBQf",
    "name": "Aku'mai",
    "bossActions": {
      "The Water Rises": [
        {
          "kind": "test",
          "dc": 18,
          "resist": "body",
          "inflicts": {
            "condition": "prone",
            "onFail": true
          }
        }
      ],
      "Second Coil": [
        {
          "kind": "test",
          "dc": 18,
          "damage": {
            "amount": 6,
            "half": true
          },
          "resist": "body",
          "inflicts": {
            "condition": "entangled",
            "onFail": true
          }
        }
      ]
    }
  },
  "amnennar-the-coldbringer": {
    "id": "ODjthjbrUjXodbhc",
    "name": "Amnennar the Coldbringer",
    "bossActions": {
      "Winter Comes Down": [
        {
          "kind": "test",
          "dc": 19,
          "damage": {
            "amount": 3
          }
        }
      ],
      "Frostbite": [
        {
          "kind": "test",
          "dc": 19,
          "damage": {
            "amount": 7,
            "half": true
          },
          "resist": "body",
          "inflicts": {
            "condition": "slowed",
            "onFail": true
          }
        }
      ]
    }
  },
  "archaedas": {
    "id": "SOa2guFH28LGhrCb",
    "name": "Archaedas",
    "bossActions": {
      "Ground Stroke": [
        {
          "kind": "test",
          "dc": 19,
          "damage": {
            "amount": 5,
            "half": true
          },
          "resist": "reflex",
          "inflicts": {
            "condition": "prone",
            "onFail": true
          }
        }
      ],
      "Stone Grip": [
        {
          "kind": "test",
          "dc": 19,
          "inflicts": {
            "condition": "entangled"
          }
        }
      ]
    }
  },
  "archmage-arugal": {
    "id": "0a0US2gEZVPWkYVI",
    "name": "Archmage Arugal",
    "bossActions": {
      "Shadow Step": [
        {
          "reason": "tableCall"
        }
      ]
    }
  },
  "azuregos": {
    "id": "GEuyUvZ1SIAWJmCv",
    "name": "Azuregos",
    "bossActions": {
      "Arcane Breath": [
        {
          "kind": "test",
          "dc": 19,
          "damage": {
            "amount": 8,
            "half": true
          },
          "resist": "reflex",
          "inflicts": {
            "condition": "numbed",
            "onFail": true
          }
        }
      ],
      "Reave the Ley": [
        {
          "kind": "test",
          "dc": 19,
          "resist": "spirit",
          "inflicts": {
            "condition": "silenced",
            "onFail": true
          }
        }
      ],
      "Elsewhere": [
        {
          "reason": "narrative"
        }
      ]
    }
  },
  "baron-rivendare": {
    "id": "y7sckPEUvKNeP1H7",
    "name": "Baron Rivendare",
    "bossActions": {
      "Deathcharger's Trample": [
        {
          "kind": "test",
          "dc": 22,
          "damage": {
            "amount": 8,
            "onFail": true
          },
          "resist": "reflex",
          "inflicts": {
            "condition": "prone",
            "onFail": true
          }
        }
      ],
      "Raise the Fallen": [
        {
          "reason": "unnamed"
        }
      ],
      "Unholy Command": [
        {
          "kind": "attack"
        },
        {
          "reason": "aura"
        }
      ]
    }
  },
  "charlga-razorflank": {
    "id": "O1WK5jdaNdaMEB9X",
    "name": "Charlga Razorflank",
    "bossActions": {
      "The Thorn Answers": [
        {
          "kind": "test",
          "dc": 18,
          "resist": "reflex",
          "inflicts": {
            "condition": "entangled",
            "onFail": true
          }
        }
      ]
    }
  },
  "chief-ukorz-sandscalp": {
    "id": "cY4O4GwF7gCwgY4F",
    "name": "Chief Ukorz Sandscalp",
    "bossActions": {
      "The Sun Overhead": [
        {
          "kind": "test",
          "dc": 19,
          "damage": {
            "amount": 5,
            "onFail": true
          },
          "resist": "body",
          "inflicts": {
            "condition": "fatigued",
            "onFail": true
          }
        }
      ],
      "Cleave the Line": [
        {
          "kind": "attack"
        }
      ]
    }
  },
  "chogall": {
    "id": "REnG6ug4y01sq7ZX",
    "name": "Cho'gall",
    "bossActions": {
      "The Whisper Answers": [
        {
          "kind": "test",
          "dc": 19,
          "resist": "spirit",
          "inflicts": {
            "condition": "frightened",
            "onFail": true
          }
        }
      ],
      "Shadow Cleave": [
        {
          "kind": "test",
          "dc": 19,
          "damage": {
            "amount": 8,
            "half": true
          },
          "resist": "reflex",
          "inflicts": {
            "condition": "numbed",
            "onFail": true
          }
        }
      ]
    }
  },
  "darkhan-drathir": {
    "id": "36PGxdmA7tSf3OdU",
    "name": "Dar'Khan Drathir",
    "bossActions": {
      "Drain the Living": [
        {
          "kind": "test",
          "dc": 18,
          "damage": {
            "amount": 6,
            "onFail": true
          },
          "resist": "spirit"
        }
      ]
    }
  },
  "darkmaster-gandling": {
    "id": "BGpKs8EWaibjHc7F",
    "name": "Darkmaster Gandling",
    "bossActions": {
      "Sent to a Room": [
        {
          "reason": "narrative"
        }
      ],
      "Shadow Lecture": [
        {
          "kind": "test",
          "dc": 19,
          "damage": {
            "amount": 6,
            "half": true
          },
          "resist": "spirit"
        }
      ]
    }
  },
  "edwin-vancleef": {
    "id": "B3R0JCg2JWds982w",
    "name": "Edwin VanCleef",
    "bossActions": {
      "Cut and Turn": [
        {
          "kind": "attack"
        }
      ]
    }
  },
  "emperor-dagran-thaurissan": {
    "id": "dETfO4ukMhYWFz5Z",
    "name": "Emperor Dagran Thaurissan",
    "bossActions": {
      "Hand of Thaurissan": [
        {
          "kind": "test",
          "dc": 22,
          "damage": {
            "amount": 9,
            "half": true
          },
          "resist": "reflex"
        }
      ],
      "Emperor's Command": [
        {
          "kind": "test",
          "dc": 22,
          "resist": "spirit",
          "inflicts": {
            "condition": "charmed",
            "onFail": true
          }
        }
      ]
    }
  },
  "gathilzogg": {
    "id": "c1jJNNhUlB0grLa4",
    "name": "Gath'Ilzogg",
    "bossActions": {
      "Down the Wall": [
        {
          "kind": "test",
          "dc": 18,
          "damage": {
            "amount": 5
          },
          "inflicts": {
            "condition": "prone"
          }
        }
      ],
      "Fight Me": [
        {
          "kind": "test",
          "dc": 18,
          "resist": "spirit"
        }
      ]
    }
  },
  "hakkar-the-soulflayer": {
    "id": "KdUmwFrpp22TZSSX",
    "name": "Hakkar the Soulflayer",
    "bossActions": {
      "Blood of the Gurubashi": [
        {
          "kind": "test",
          "dc": 22,
          "resist": "body",
          "inflicts": {
            "condition": "bleeding",
            "onFail": true
          }
        }
      ],
      "Drain the Chamber": [
        {
          "kind": "test",
          "dc": 22,
          "damage": {
            "amount": 5,
            "half": true
          },
          "resist": "spirit"
        }
      ]
    },
    "costs": {
      "The Priests Chant": {
        "from": 1,
        "to": 2
      }
    }
  },
  "high-inquisitor-whitemane": {
    "id": "YTWVS4JeH6u1qgrV",
    "name": "High Inquisitor Whitemane",
    "bossActions": {
      "Deliver Judgement": [
        {
          "kind": "test",
          "dc": 18,
          "damage": {
            "amount": 5,
            "onFail": true
          },
          "resist": "spirit",
          "inflicts": {
            "condition": "stunned",
            "onFail": true
          }
        }
      ],
      "Raise Mograine": [
        {
          "kind": "summon",
          "uses": {
            "max": 1,
            "value": 1,
            "per": "encounter"
          },
          "summon": {
            "entry": "Scarlet Knight",
            "count": 1
          }
        }
      ]
    }
  },
  "immolthar": {
    "id": "OVTFxMZcQUPLa91X",
    "name": "Immol'thar",
    "bossActions": {
      "Arcane Lash": [
        {
          "kind": "test",
          "dc": 22,
          "damage": {
            "amount": 7,
            "half": true
          },
          "resist": "reflex"
        }
      ],
      "Feed": [
        {
          "kind": "heal",
          "heal": 5
        }
      ],
      "Thrash": [
        {
          "kind": "test",
          "dc": 22,
          "damage": {
            "amount": 5
          }
        }
      ]
    }
  },
  "ivus-the-forest-lord": {
    "id": "RCpgoyIyQ45MRSLZ",
    "name": "Ivus the Forest Lord",
    "bossActions": {
      "Root the Ground": [
        {
          "kind": "test",
          "dc": 19,
          "resist": "reflex",
          "inflicts": {
            "condition": "entangled",
            "onFail": true
          }
        }
      ],
      "Sweep the Hall": [
        {
          "kind": "test",
          "dc": 19,
          "damage": {
            "amount": 7,
            "half": true
          },
          "resist": "reflex",
          "inflicts": {
            "condition": "prone",
            "onFail": true
          }
        }
      ]
    }
  },
  "jammalan-the-prophet": {
    "id": "RitQXkPc3D6MpB1G",
    "name": "Jammal'an the Prophet",
    "bossActions": {
      "Speak for the God": [
        {
          "kind": "test",
          "dc": 22,
          "resist": "spirit",
          "inflicts": {
            "condition": "frightened",
            "onFail": true
          }
        }
      ],
      "Blood for the Dreamer": [
        {
          "kind": "test",
          "dc": 22,
          "damage": {
            "amount": 7,
            "half": true
          },
          "resist": "body"
        }
      ]
    }
  },
  "kelthuzad": {
    "id": "iaCrJ6NTW63Mp2VD",
    "name": "Kel'Thuzad",
    "bossActions": {
      "The Dead Attend": [
        {
          "reason": "unnamed"
        }
      ],
      "Frost Blast": [
        {
          "kind": "test",
          "dc": 22,
          "damage": {
            "amount": 9,
            "half": true
          },
          "resist": "body",
          "inflicts": {
            "condition": "entangled",
            "onFail": true
          }
        }
      ],
      "Shadow Fissure": [
        {
          "kind": "test",
          "dc": 22,
          "damage": {
            "amount": 8,
            "onFail": true
          },
          "resist": "reflex"
        }
      ]
    }
  },
  "king-gordok": {
    "id": "lkClYDGBVyLWXcJ6",
    "name": "King Gordok",
    "bossActions": {
      "Bellow": [
        {
          "kind": "test",
          "dc": 22,
          "resist": "spirit",
          "inflicts": {
            "condition": "frightened",
            "onFail": true
          }
        }
      ],
      "Sweep": [
        {
          "kind": "test",
          "dc": 22,
          "damage": {
            "amount": 9,
            "half": true
          },
          "resist": "reflex",
          "inflicts": {
            "condition": "prone",
            "onFail": true
          }
        }
      ]
    }
  },
  "lokholar-the-ice-lord": {
    "id": "1fqmk5ggTqKHtGDd",
    "name": "Lokholar the Ice Lord",
    "bossActions": {
      "Glacier": [
        {
          "kind": "test",
          "dc": 19,
          "damage": {
            "amount": 4
          }
        }
      ],
      "Rimebind": [
        {
          "kind": "test",
          "dc": 19,
          "resist": "body",
          "inflicts": {
            "condition": "entangled",
            "onFail": true
          }
        }
      ],
      "Whiteout": [
        {
          "kind": "test",
          "dc": 19,
          "resist": "reflex",
          "inflicts": {
            "condition": "blinded",
            "onFail": true
          }
        }
      ]
    }
  },
  "lord-aliden-perenolde": {
    "id": "RtyNyBB1stVnQn81",
    "name": "Lord Aliden Perenolde",
    "bossActions": {
      "Sell Them Out": [
        {
          "kind": "attack"
        },
        {
          "reason": "aura"
        }
      ]
    }
  },
  "lord-banehollow": {
    "id": "NEK7U1wXuEVJxDW4",
    "name": "Lord Banehollow",
    "bossActions": {
      "Felfire": [
        {
          "kind": "test",
          "dc": 19,
          "damage": {
            "amount": 6,
            "onFail": true
          },
          "resist": "reflex"
        }
      ],
      "Bind": [
        {
          "kind": "test",
          "dc": 19,
          "resist": "spirit"
        }
      ]
    },
    "costs": {
      "Send the Hounds": {
        "from": 1,
        "to": 2
      }
    }
  },
  "morladim": {
    "id": "VC85Y6iNbvCa0dzu",
    "name": "Mor'Ladim",
    "bossActions": {
      "Sorrow": [
        {
          "kind": "test",
          "dc": 18,
          "resist": "spirit",
          "inflicts": {
            "condition": "frightened",
            "onFail": true
          }
        }
      ]
    }
  },
  "mutanus-the-devourer": {
    "id": "1hJq0WMrhWIqpKuy",
    "name": "Mutanus the Devourer",
    "bossActions": {
      "Drag Under": [
        {
          "kind": "test",
          "dc": 18,
          "resist": "body",
          "inflicts": {
            "condition": "prone",
            "onFail": true
          }
        }
      ],
      "The Caverns Wail": [
        {
          "kind": "test",
          "dc": 18,
          "damage": {
            "amount": 5,
            "half": true
          },
          "resist": "body",
          "inflicts": {
            "condition": "deafened",
            "onFail": true
          }
        }
      ]
    }
  },
  "nefarian": {
    "id": "chuOwnRw1bruKf0B",
    "name": "Nefarian",
    "bossActions": {
      "Class Call": [
        {
          "reason": "aura"
        }
      ],
      "Breath": [
        {
          "kind": "test",
          "dc": 22,
          "damage": {
            "amount": 10,
            "half": true
          },
          "resist": "reflex"
        }
      ]
    }
  },
  "onyxia": {
    "id": "SrfwajoRdaPBaJVt",
    "name": "Onyxia",
    "bossActions": {
      "Deep Breath": [
        {
          "kind": "test",
          "dc": 22,
          "damage": {
            "amount": 10,
            "half": true
          },
          "resist": "reflex"
        }
      ],
      "Knock Aside": [
        {
          "kind": "test",
          "dc": 22,
          "damage": {
            "amount": 6,
            "half": true
          },
          "resist": "body",
          "inflicts": {
            "condition": "prone",
            "onFail": true
          }
        }
      ]
    }
  },
  "prince-malchezaar": {
    "id": "MaVcoGKlLX8KsLHu",
    "name": "Prince Malchezaar",
    "bossActions": {
      "Shadow Nova": [
        {
          "kind": "test",
          "dc": 22,
          "damage": {
            "amount": 9,
            "half": true
          },
          "resist": "spirit",
          "inflicts": {
            "condition": "frightened",
            "onFail": true
          }
        }
      ],
      "Enfeeble": [
        {
          "reason": "narrative"
        }
      ]
    }
  },
  "prince-tortheldrin": {
    "id": "DqKQjrcnOp92f2ia",
    "name": "Prince Tortheldrin",
    "bossActions": {
      "Step Aside": [
        {
          "reason": "tableCall"
        }
      ],
      "Arcane Storm": [
        {
          "kind": "test",
          "dc": 22,
          "damage": {
            "amount": 6,
            "half": true
          },
          "resist": "reflex"
        }
      ]
    }
  },
  "princess-theradras": {
    "id": "LfVbiYsNNFU8hJOn",
    "name": "Princess Theradras",
    "bossActions": {
      "The Cavern Is Alive": [
        {
          "kind": "test",
          "dc": 19,
          "resist": "reflex",
          "inflicts": {
            "condition": "entangled",
            "onFail": true
          }
        }
      ],
      "Landslide": [
        {
          "kind": "test",
          "dc": 19,
          "damage": {
            "amount": 6,
            "half": true
          },
          "resist": "reflex",
          "inflicts": {
            "condition": "prone",
            "onFail": true
          }
        }
      ],
      "Stone Mends Stone": [
        {
          "kind": "heal",
          "heal": 12
        }
      ]
    }
  },
  "ragnaros": {
    "id": "lu4qe28NSQe3ObGQ",
    "name": "Ragnaros",
    "bossActions": {
      "Wrath of Ragnaros": [
        {
          "kind": "test",
          "dc": 22,
          "damage": {
            "amount": 8,
            "half": true
          },
          "resist": "body"
        }
      ],
      "Melt": [
        {
          "kind": "test",
          "dc": 22,
          "damage": {
            "amount": 10,
            "half": true
          },
          "resist": "reflex"
        }
      ]
    }
  },
  "razelikh-the-defiler": {
    "id": "jnY9oDfmDsqF9O2f",
    "name": "Razelikh the Defiler",
    "bossActions": {
      "Hellfire": [
        {
          "kind": "test",
          "dc": 19,
          "damage": {
            "amount": 6,
            "onFail": true
          },
          "resist": "reflex"
        }
      ],
      "The Bargain": [
        {
          "kind": "test",
          "dc": 19,
          "resist": "spirit"
        }
      ]
    }
  },
  "rend-blackhand": {
    "id": "1GvGmatSuzrbaPFi",
    "name": "Rend Blackhand",
    "bossActions": {
      "Gyth Takes the Air": [
        {
          "reason": "narrative"
        }
      ],
      "Break Them": [
        {
          "kind": "test",
          "dc": 22,
          "damage": {
            "amount": 8,
            "half": true
          },
          "resist": "body",
          "inflicts": {
            "condition": "prone",
            "onFail": true
          }
        }
      ]
    }
  },
  "sicco-thermaplugg": {
    "id": "mg6TgMr3RaHeLNZ0",
    "name": "Sicco Thermaplugg",
    "bossActions": {
      "Pull the Lever": [
        {
          "kind": "test",
          "dc": 18,
          "damage": {
            "amount": 4,
            "onFail": true
          },
          "resist": "reflex"
        }
      ],
      "Vent the Section": [
        {
          "kind": "test",
          "dc": 18,
          "damage": {
            "amount": 3,
            "onFail": true
          },
          "resist": "body",
          "inflicts": {
            "condition": "poisoned",
            "onFail": true
          },
          "afflict": {
            "kind": "poison",
            "key": "vent-the-section",
            "name": "Vent the Section",
            "dc": 18,
            "resilience": "body",
            "value": 1
          }
        }
      ]
    }
  },
  "stitches": {
    "id": "9MgTDSTrX3Z3ILO3",
    "name": "Stitches",
    "bossActions": {
      "Sweep the Road": [
        {
          "kind": "test",
          "dc": 18,
          "resist": "body",
          "inflicts": {
            "condition": "prone",
            "onFail": true
          }
        }
      ],
      "Grab": [
        {
          "kind": "test",
          "dc": 18,
          "damage": {
            "amount": 5
          },
          "inflicts": {
            "condition": "entangled"
          }
        }
      ]
    }
  },
  "the-prophet-skeram": {
    "id": "rfDgaCbJIKNu9URr",
    "name": "The Prophet Skeram",
    "bossActions": {
      "Three Places at Once": [
        {
          "reason": "narrative"
        }
      ],
      "Arcane Explosion": [
        {
          "kind": "test",
          "dc": 22,
          "damage": {
            "amount": 8,
            "half": true
          },
          "resist": "reflex"
        }
      ],
      "True Fulfillment": [
        {
          "kind": "test",
          "dc": 22,
          "resist": "spirit",
          "inflicts": {
            "condition": "charmed",
            "onFail": true
          }
        }
      ]
    }
  },
  "ursal-the-mauler": {
    "id": "bfhj3gHInSZV8qs4",
    "name": "Ursal the Mauler",
    "bossActions": {
      "Shake the Roots": [
        {
          "kind": "test",
          "dc": 17,
          "resist": "reflex",
          "inflicts": {
            "condition": "prone",
            "onFail": true
          }
        }
      ],
      "Maul": [
        {
          "kind": "attack",
          "inflicts": {
            "condition": "bleeding",
            "value": 2
          }
        }
      ]
    }
  },
  "vile-priestess-hexx": {
    "id": "h78TY464dPQcpGRU",
    "name": "Vile Priestess Hexx",
    "bossActions": {
      "The Altar Takes": [
        {
          "kind": "test",
          "dc": 19,
          "damage": {
            "amount": 6,
            "onFail": true
          },
          "resist": "spirit"
        }
      ],
      "Hex the Loudest": [
        {
          "kind": "test",
          "dc": 19,
          "resist": "spirit",
          "inflicts": {
            "condition": "silenced",
            "onFail": true
          }
        }
      ]
    }
  },
  "zalazane": {
    "id": "g3RqtBbY4r4oX0nA",
    "name": "Zalazane",
    "bossActions": {
      "Take the Mind": [
        {
          "kind": "test",
          "dc": 17,
          "resist": "spirit",
          "inflicts": {
            "condition": "charmed",
            "onFail": true
          }
        }
      ],
      "Mask of the Loa": [
        {
          "kind": "test",
          "dc": 17,
          "resist": "spirit",
          "inflicts": {
            "condition": "frightened",
            "onFail": true
          }
        }
      ]
    }
  },
  "zuljin": {
    "id": "1HsdiyWRWFx01oKV",
    "name": "Zul'jin",
    "bossActions": {
      "Amani Fury": [
        {
          "kind": "attack"
        },
        {
          "reason": "narrative"
        }
      ],
      "Throw the Axe": [
        {
          "kind": "test",
          "dc": 19,
          "damage": {
            "amount": 7,
            "half": true
          },
          "resist": "reflex",
          "inflicts": {
            "condition": "bleeding",
            "onFail": true
          }
        }
      ]
    },
    "costs": {
      "Call the Amani": {
        "from": 1,
        "to": 2
      }
    }
  }
});

const clone = value => JSON.parse(JSON.stringify(value ?? null));

/** Deep equality with key order ignored. */
function same(a, b) {
  const sorted = v => (Array.isArray(v) ? v.map(sorted)
    : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sorted(v[k])])) : v);
  return JSON.stringify(sorted(a ?? null)) === JSON.stringify(sorted(b ?? null));
}

/**
 * The old rows for one creature: by the bestiary entry it was dragged from, else by its name.
 *
 * @param {{name?: string|null, source?: string|null}} creature
 * @param {object} [table]
 * @returns {object|null}
 */
export function oldBossRowsFor({ name = null, source = null } = {}, table = OLD_BOSS_ACTIONS) {
  const entries = Object.values(table);
  const id = bestiaryEntryId(source);
  if (id) return entries.find(e => e.id === id) ?? null;
  return entries.find(e => e.name === name) ?? null;
}

/** The pack's descriptor for a stale row, keeping a spent use where the uses count the same. */
function restamp(stored, fresh) {
  const out = clone(fresh);
  const held = cleanAutomation(stored).uses;
  if (out.uses.max !== null && held.max === out.uses.max && held.per === out.uses.per && held.value !== null) {
    out.uses.value = Math.min(held.value, out.uses.max);
  }
  return out;
}

/**
 * One creature's plan: the `system.bossActions` update or null, the rows restamped, the rows
 * kept as a GM's own, and the costs written.
 *
 * @param {object} raw   the stored system
 * @param {object|null} pack  the pack copy's system
 * @param {object|null} old   the creature's `OLD_BOSS_ACTIONS` entry
 */
export function planBossActions(raw, pack = null, old = null) {
  const plan = { update: null, restamped: [], kept: [], costs: [] };
  if (!raw || typeof raw !== "object" || !pack || typeof pack !== "object" || !old) return plan;
  const stored = Array.isArray(raw.bossActions) ? raw.bossActions : [];
  const fresh = Array.isArray(pack.bossActions) ? pack.bossActions : [];
  if (!stored.length || !fresh.length) return plan;
  const byName = new Map(fresh.map(r => [r?.name, r]));
  let moved = false;
  const rows = stored.map(row => {
    const name = row?.name;
    const want = byName.get(name) ?? null;
    if (!want) return row;
    let next = row;
    const befores = typeof name === "string" && Object.hasOwn(old.bossActions ?? {}, name) ? old.bossActions[name] : null;
    if (befores) {
      const have = comparable(row.automation);
      if (!same(have, comparable(want.automation))) {
        if (befores.some(b => same(have, comparable(b)))) {
          next = { ...next, automation: restamp(row.automation, cleanAutomation(want.automation)) };
          plan.restamped.push(name);
          moved = true;
        } else plan.kept.push(name);
      }
    }
    const cost = old.costs?.[name] ?? null;
    if (cost && row.cost === cost.from && want.cost === cost.to) {
      next = { ...next, cost: cost.to };
      plan.costs.push(name);
      moved = true;
    }
    return next;
  });
  if (moved) plan.update = { "system.bossActions": clone(rows) };
  return plan;
}

/**
 * Whether the compiled bestiary carries D-809's descriptors: some recorded row whose pack copy
 * is none of its old copies.
 *
 * @param {Map<string, object>|null|undefined} byName
 * @param {object} [table]
 */
export function packCarriesBossActions(byName, table = OLD_BOSS_ACTIONS) {
  for (const entry of Object.values(table)) {
    const system = byName?.get?.(entry.name) ?? null;
    for (const [name, befores] of Object.entries(entry.bossActions ?? {})) {
      const row = (Array.isArray(system?.bossActions) ? system.bossActions : []).find(r => r?.name === name);
      if (row && !befores.some(b => same(comparable(row.automation), comparable(b)))) return true;
    }
  }
  return false;
}

/** Where a stored creature says it was dragged from. */
function sourceOf(doc) {
  const source = doc?._source ?? {};
  return source._stats?.compendiumSource ?? doc?._stats?.compendiumSource ?? source.flags?.core?.sourceId ?? null;
}

export async function migrate(log = console.log) {
  const bestiary = await packSystems(BESTIARY_PACK);
  if (!packCarriesBossActions(bestiary.byName)) {
    console.warn(bestiary.byName.size
      ? `azeroth-rpg | 0.13.2: ${BESTIARY_PACK} carries none of D-809's Boss Action descriptors yet, so no Boss was restamped. `
        + "Run `npm run packs:parse` and `npm run packs:build`, restart the server, set `migrationVersion` back to 0.13.1 and reload."
      : `azeroth-rpg | 0.13.2: ${BESTIARY_PACK} is not available, so no Boss was restamped.`);
    return 0;
  }
  return walkWorld({
    actor: doc => {
      if (doc.type !== "npc") return null;
      const old = oldBossRowsFor({ name: doc.name, source: sourceOf(doc) });
      if (!old) return null;
      const plan = planBossActions(rawSystem(doc), bestiary.byName.get(old.name) ?? null, old);
      const where = `${doc.name} (${doc.uuid ?? doc.id})`;
      for (const name of plan.restamped) log(`azeroth-rpg | 0.13.2: ${where} takes the pack's descriptor for ${name}`);
      for (const name of plan.costs) log(`azeroth-rpg | 0.13.2: ${where} marks ${name} ×2, as 14 now does`);
      for (const name of plan.kept) log(`azeroth-rpg | 0.13.2: ${where} keeps its own descriptor for ${name}: it is neither an old pack copy nor the new one`);
      return plan.update;
    }
  }, log);
}
