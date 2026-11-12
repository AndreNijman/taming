// Numeric mechanics transcribed from public wiki infoboxes, checked 2026-11-12.
// Page infoboxes take precedence over the older aggregate module. No game code/art.
export const ANIMAL_REFERENCE = {
  "cow": {
    "reference": "Cow",
    "source": "https://tamingio.fandom.com/wiki/Cow",
    "hp": [
      200.0,
      500.0,
      1200.0
    ],
    "bite": [
      4.0,
      7.0,
      18.0
    ],
    "speed": [
      200.0,
      250.0,
      280.0
    ],
    "weight": [
      10.0,
      300.0,
      800.0
    ],
    "regen": [
      1.0,
      1.0,
      1.0
    ],
    "regenDelay": [
      15.0,
      15.0,
      15.0
    ],
    "types": [
      "normal"
    ],
    "tame": 12.0,
    "tool": "appletor",
    "mountable": true,
    "shieldable": true,
    "ability": "milk",
    "skillName": "Regenerating Milk",
    "skillStats": [
      {
        "reload": 30.0,
        "player_dmg": 10.0,
        "animal_dmg": 20.0,
        "slowdown": 0.95,
        "heal_ot": 5.0
      },
      {
        "reload": 25.0,
        "player_dmg": 15.0,
        "animal_dmg": 30.0,
        "slowdown": 0.9,
        "heal_ot": 10.0
      },
      {
        "reload": 20.0,
        "player_dmg": 20.0,
        "animal_dmg": 40.0,
        "slowdown": 0.85,
        "heal_ot": 15.0
      }
    ]
  },
  "bull": {
    "reference": "Bull",
    "source": "https://tamingio.fandom.com/wiki/Bull",
    "hp": [
      300.0,
      800.0,
      1800.0
    ],
    "bite": [
      5.0,
      10.0,
      26.0
    ],
    "speed": [
      210.0,
      250.0,
      290.0
    ],
    "weight": [
      10.0,
      300.0,
      800.0
    ],
    "regen": [
      1.0,
      1.0,
      1.0
    ],
    "regenDelay": [
      12.0,
      12.0,
      12.0
    ],
    "types": [
      "rock"
    ],
    "tame": 10.0,
    "tool": "slingshot",
    "mountable": true,
    "shieldable": true,
    "ability": "rockslide",
    "skillName": "Rock Slide",
    "skillStats": [
      {
        "reload": 40.0,
        "player_dmg": 5.0,
        "player_dmg_ot": 0.0,
        "animal_dmg": 10.0,
        "animal_dmg_ot": 1.0,
        "building_dmg": 50.0,
        "building_dmg_ot": 4.0
      },
      {
        "reload": 35.0,
        "player_dmg": 10.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 20.0,
        "animal_dmg_ot": 2.0,
        "building_dmg": 65.0,
        "building_dmg_ot": 6.0
      },
      {
        "reload": 30.0,
        "player_dmg": 15.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 30.0,
        "animal_dmg_ot": 3.0,
        "building_dmg": 80.0,
        "building_dmg_ot": 8.0
      }
    ]
  },
  "dog": {
    "reference": "Dog",
    "source": "https://tamingio.fandom.com/wiki/Dog",
    "hp": [
      200.0,
      400.0,
      800.0
    ],
    "bite": [
      5.0,
      12.0,
      24.0
    ],
    "speed": [
      280.0,
      300.0,
      380.0
    ],
    "weight": [
      10.0,
      150.0,
      300.0
    ],
    "regen": [
      3.0,
      3.0,
      3.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "normal"
    ],
    "tame": 10.0,
    "tool": "slingshot",
    "mountable": true,
    "shieldable": true,
    "ability": "bark",
    "skillName": "Motivating Bark",
    "skillStats": [
      {
        "reload": 26.0,
        "heal_ot": 10.0
      },
      {
        "reload": 22.0,
        "heal_ot": 20.0
      },
      {
        "reload": 18.0,
        "heal_ot": 30.0
      }
    ]
  },
  "wolf": {
    "reference": "Wolf",
    "source": "https://tamingio.fandom.com/wiki/Wolf",
    "hp": [
      200.0,
      400.0,
      1000.0
    ],
    "bite": [
      6.0,
      12.0,
      30.0
    ],
    "speed": [
      200.0,
      250.0,
      280.0
    ],
    "weight": [
      10.0,
      150.0,
      300.0
    ],
    "regen": [
      1.0,
      1.0,
      1.0
    ],
    "regenDelay": [
      15.0,
      15.0,
      15.0
    ],
    "types": [
      "fire"
    ],
    "tame": 66.0,
    "tool": "slingshot",
    "mountable": true,
    "shieldable": true,
    "ability": "blaze",
    "skillName": "Deflagration",
    "skillStats": [
      {
        "reload": 30.0,
        "player_dmg": 10.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 20.0,
        "animal_dmg_ot": 2.0,
        "building_dmg": 5.0,
        "building_dmg_ot": 1.0
      },
      {
        "reload": 28.0,
        "player_dmg": 15.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 30.0,
        "animal_dmg_ot": 3.0,
        "building_dmg": 10.0,
        "building_dmg_ot": 2.0
      },
      {
        "reload": 25.0,
        "player_dmg": 20.0,
        "player_dmg_ot": 2.0,
        "animal_dmg": 40.0,
        "animal_dmg_ot": 4.0,
        "building_dmg": 15.0,
        "building_dmg_ot": 3.0
      }
    ]
  },
  "rabbit": {
    "reference": "Rabbit",
    "source": "https://tamingio.fandom.com/wiki/Rabbit",
    "hp": [
      150.0,
      250.0,
      700.0
    ],
    "bite": [
      3.0,
      4.0,
      14.0
    ],
    "speed": [
      270.0,
      290.0,
      370.0
    ],
    "weight": [
      5.0,
      50.0,
      150.0
    ],
    "regen": [
      3.0,
      3.0,
      3.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "plant"
    ],
    "tame": 66.0,
    "tool": "appletor",
    "mountable": true,
    "shieldable": true,
    "ability": "vines",
    "skillName": "Vampiric Weed",
    "skillStats": [
      {
        "reload": 20.0,
        "player_dmg": 5.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 10.0,
        "animal_dmg_ot": 2.0,
        "building_dmg": 5.0,
        "building_dmg_ot": 1.0,
        "vampirism": 0.0,
        "slowdown": 0.8
      },
      {
        "reload": 18.0,
        "player_dmg": 7.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 15.0,
        "animal_dmg_ot": 3.0,
        "building_dmg": 8.0,
        "building_dmg_ot": 2.0,
        "vampirism": 1.0,
        "slowdown": 0.65
      },
      {
        "reload": 15.0,
        "player_dmg": 10.0,
        "player_dmg_ot": 2.0,
        "animal_dmg": 20.0,
        "animal_dmg_ot": 4.0,
        "building_dmg": 10.0,
        "building_dmg_ot": 2.0,
        "vampirism": 1.0,
        "slowdown": 0.5
      }
    ]
  },
  "bear": {
    "reference": "Bear",
    "source": "https://tamingio.fandom.com/wiki/Bear",
    "hp": [
      300.0,
      600.0,
      1500.0
    ],
    "bite": [
      4.0,
      8.0,
      19.0
    ],
    "speed": [
      200.0,
      240.0,
      250.0
    ],
    "weight": [
      10.0,
      300.0,
      800.0
    ],
    "regen": [
      2.0,
      2.0,
      2.0
    ],
    "regenDelay": [
      15.0,
      15.0,
      15.0
    ],
    "types": [
      "water"
    ],
    "tame": 66.0,
    "tool": "slingshot",
    "mountable": true,
    "shieldable": false,
    "ability": "wave",
    "skillName": "Ocean Wave",
    "skillStats": [
      {
        "reload": 30.0,
        "player_dmg": 10.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 20.0,
        "animal_dmg_ot": 3.0,
        "building_dmg": 30.0,
        "building_dmg_ot": 3.0
      },
      {
        "reload": 28.0,
        "player_dmg": 12.0,
        "player_dmg_ot": 2.0,
        "animal_dmg": 25.0,
        "animal_dmg_ot": 4.0,
        "building_dmg": 40.0,
        "building_dmg_ot": 4.0
      },
      {
        "reload": 25.0,
        "player_dmg": 15.0,
        "player_dmg_ot": 2.0,
        "animal_dmg": 30.0,
        "animal_dmg_ot": 5.0,
        "building_dmg": 60.0,
        "building_dmg_ot": 5.0
      }
    ]
  },
  "fox": {
    "reference": "Fox",
    "source": "https://tamingio.fandom.com/wiki/Fox",
    "hp": [
      200.0,
      400.0,
      1000.0
    ],
    "bite": [
      4.0,
      8.0,
      19.0
    ],
    "speed": [
      240.0,
      280.0,
      310.0
    ],
    "weight": [
      10.0,
      150.0,
      300.0
    ],
    "regen": [
      2.0,
      2.0,
      2.0
    ],
    "regenDelay": [
      15.0,
      15.0,
      15.0
    ],
    "types": [
      "electric"
    ],
    "tame": 14.0,
    "tool": "appletor",
    "mountable": true,
    "shieldable": true,
    "ability": "thunder",
    "skillName": "Thunder",
    "skillStats": [
      {
        "reload": 30.0,
        "player_dmg": 7.0,
        "animal_dmg": 15.0,
        "building_dmg": 5.0,
        "slowdown": 0.8
      },
      {
        "reload": 25.0,
        "player_dmg": 12.0,
        "animal_dmg": 25.0,
        "building_dmg": 8.0,
        "slowdown": 0.7
      },
      {
        "reload": 20.0,
        "player_dmg": 17.0,
        "animal_dmg": 35.0,
        "building_dmg": 10.0,
        "slowdown": 0.6
      }
    ]
  },
  "boar": {
    "reference": "Boar",
    "source": "https://tamingio.fandom.com/wiki/Boar",
    "hp": [
      300.0,
      600.0,
      1250.0
    ],
    "bite": [
      4.0,
      12.0,
      24.0
    ],
    "speed": [
      240.0,
      270.0,
      310.0
    ],
    "weight": [
      10.0,
      200.0,
      400.0
    ],
    "regen": [
      2.0,
      2.0,
      2.0
    ],
    "regenDelay": [
      15.0,
      15.0,
      15.0
    ],
    "types": [
      "poison"
    ],
    "tame": 10.0,
    "tool": "slingshot",
    "mountable": true,
    "shieldable": true,
    "ability": "mud",
    "skillName": "Infernal Mud",
    "skillStats": [
      {
        "reload": 35.0,
        "player_dmg": 1.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 2.0,
        "animal_dmg_ot": 3.0,
        "slowdown": 0.8
      },
      {
        "reload": 32.0,
        "player_dmg": 2.0,
        "player_dmg_ot": 2.0,
        "animal_dmg": 4.0,
        "animal_dmg_ot": 4.0,
        "slowdown": 0.6
      },
      {
        "reload": 30.0,
        "player_dmg": 3.0,
        "player_dmg_ot": 3.0,
        "animal_dmg": 6.0,
        "animal_dmg_ot": 6.0,
        "slowdown": 0.4
      }
    ]
  },
  "hedgehog": {
    "reference": "Hedgehog",
    "source": "https://tamingio.fandom.com/wiki/Hedgehog",
    "hp": [
      300.0,
      700.0,
      1200.0
    ],
    "bite": [
      4.0,
      10.0,
      22.0
    ],
    "speed": [
      210.0,
      260.0,
      290.0
    ],
    "weight": [
      10.0,
      140.0,
      280.0
    ],
    "regen": [
      2.0,
      2.0,
      2.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "fire"
    ],
    "tame": 12.0,
    "tool": "appletor",
    "mountable": true,
    "shieldable": true,
    "ability": "hindrance",
    "skillName": "Burning Hindrance",
    "skillStats": [
      {
        "reload": 21.0,
        "player_dmg_ot": 1.0,
        "animal_dmg_ot": 2.0
      },
      {
        "reload": 18.0,
        "player_dmg_ot": 1.0,
        "animal_dmg_ot": 3.0
      },
      {
        "reload": 15.0,
        "player_dmg_ot": 2.0,
        "animal_dmg_ot": 4.0
      }
    ]
  },
  "deer": {
    "reference": "Deer",
    "source": "https://tamingio.fandom.com/wiki/Deer",
    "hp": [
      200.0,
      400.0,
      900.0
    ],
    "bite": [
      3.0,
      7.0,
      15.0
    ],
    "speed": [
      260.0,
      280.0,
      360.0
    ],
    "weight": [
      10.0,
      200.0,
      400.0
    ],
    "regen": [
      4.0,
      4.0,
      4.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "plant"
    ],
    "tame": 10.0,
    "tool": "appletor",
    "mountable": true,
    "shieldable": true,
    "ability": "drain-dash",
    "skillName": "Vampiric Dash",
    "skillStats": [
      {
        "reload": 25.0,
        "player_dmg": 2.0,
        "player_dmg_ot": 2.0,
        "animal_dmg": 4.0,
        "animal_dmg_ot": 4.0,
        "building_dmg": 1.0,
        "building_dmg_ot": 1.0,
        "vampirism": 2.0,
        "speed_bonus": 100.0
      },
      {
        "reload": 22.0,
        "player_dmg": 2.0,
        "player_dmg_ot": 2.0,
        "animal_dmg": 5.0,
        "animal_dmg_ot": 5.0,
        "building_dmg": 1.0,
        "building_dmg_ot": 1.0,
        "vampirism": 4.0,
        "speed_bonus": 200.0
      },
      {
        "reload": 20.0,
        "player_dmg": 3.0,
        "player_dmg_ot": 3.0,
        "animal_dmg": 6.0,
        "animal_dmg_ot": 6.0,
        "building_dmg": 3.0,
        "building_dmg_ot": 2.0,
        "vampirism": 6.0,
        "speed_bonus": 300.0
      }
    ]
  },
  "owl": {
    "reference": "Barn Owl",
    "source": "https://tamingio.fandom.com/wiki/Barn_Owl",
    "hp": [
      300.0,
      600.0,
      1400.0
    ],
    "bite": [
      3.0,
      10.0,
      18.0
    ],
    "speed": [
      200.0,
      250.0,
      280.0
    ],
    "weight": [
      5.0,
      30.0,
      40.0
    ],
    "regen": [
      2.0,
      2.0,
      2.0
    ],
    "regenDelay": [
      15.0,
      15.0,
      15.0
    ],
    "types": [
      "shadow"
    ],
    "tame": 18.0,
    "tool": "appletor",
    "mountable": true,
    "shieldable": true,
    "ability": "curse",
    "skillName": "Cursed Feather",
    "skillStats": [
      {
        "reload": 32.0,
        "player_dmg_ot": 1.0,
        "animal_dmg_ot": 2.0,
        "building_dmg_ot": 1,
        "slowdown": 0.99
      },
      {
        "reload": 32.0,
        "player_dmg_ot": 1.0,
        "animal_dmg_ot": 3.0,
        "building_dmg_ot": 2,
        "slowdown": 0.97
      },
      {
        "reload": 28.0,
        "player_dmg_ot": 2.0,
        "animal_dmg_ot": 4.0,
        "building_dmg_ot": 3,
        "slowdown": 0.95
      }
    ]
  },
  "penguin": {
    "reference": "Penguin",
    "source": "https://tamingio.fandom.com/wiki/Penguin",
    "hp": [
      200.0,
      400.0,
      800.0
    ],
    "bite": [
      4.0,
      8.0,
      16.0
    ],
    "speed": [
      240.0,
      270.0,
      330.0
    ],
    "weight": [
      5.0,
      60.0,
      160.0
    ],
    "regen": [
      2.0,
      2.0,
      2.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "ice"
    ],
    "tame": 10.0,
    "tool": "appletor",
    "mountable": false,
    "shieldable": false,
    "ability": "rampart",
    "skillName": "Glacial Rampart",
    "skillStats": [
      {
        "reload": 16.0,
        "player_dmg": 5.0,
        "animal_dmg": 10.0
      },
      {
        "reload": 12.0,
        "player_dmg": 10.0,
        "animal_dmg": 20.0
      },
      {
        "reload": 8.0,
        "player_dmg": 20.0,
        "animal_dmg": 40.0
      }
    ]
  },
  "lynx": {
    "reference": "Lynx",
    "source": "https://tamingio.fandom.com/wiki/Lynx",
    "hp": [
      200.0,
      400.0,
      800.0
    ],
    "bite": [
      6.0,
      14.0,
      30.0
    ],
    "speed": [
      200.0,
      250.0,
      280.0
    ],
    "weight": [
      10.0,
      150.0,
      300.0
    ],
    "regen": [
      3.0,
      3.0,
      3.0
    ],
    "regenDelay": [
      15.0,
      15.0,
      15.0
    ],
    "types": [
      "combat"
    ],
    "tame": 10.0,
    "tool": "slingshot",
    "mountable": true,
    "shieldable": true,
    "ability": "lunge",
    "skillName": "Scratch",
    "skillStats": [
      {
        "reload": 22.0,
        "player_dmg": 20.0,
        "animal_dmg": 40.0,
        "building_dmg": 5.0,
        "speed_bonus": 300.0
      },
      {
        "reload": 20.0,
        "player_dmg": 25.0,
        "animal_dmg": 50.0,
        "building_dmg": 10.0,
        "speed_bonus": 400.0
      },
      {
        "reload": 18.0,
        "player_dmg": 32.0,
        "animal_dmg": 65.0,
        "building_dmg": 20.0,
        "speed_bonus": 500.0
      }
    ]
  },
  "arctic-fox": {
    "reference": "Snow Fox",
    "source": "https://tamingio.fandom.com/wiki/Snow_Fox",
    "hp": [
      200.0,
      400.0,
      900.0
    ],
    "bite": [
      5.0,
      10.0,
      24.0
    ],
    "speed": [
      240.0,
      280.0,
      310.0
    ],
    "weight": [
      10.0,
      150.0,
      300.0
    ],
    "regen": [
      3.0,
      3.0,
      3.0
    ],
    "regenDelay": [
      15.0,
      15.0,
      15.0
    ],
    "types": [
      "ice"
    ],
    "tame": 12.0,
    "tool": "slingshot",
    "mountable": true,
    "shieldable": true,
    "ability": "ice-shield",
    "skillName": "Ice Wall",
    "skillStats": [
      {
        "reload": 20.0,
        "player_dmg": 7.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 15.0,
        "animal_dmg_ot": 3.0,
        "building_dmg": 5.0,
        "building_dmg_ot": 1.0,
        "dmg_reduction": 0.5
      },
      {
        "reload": 18.0,
        "player_dmg": 10.0,
        "player_dmg_ot": 2.0,
        "animal_dmg": 20.0,
        "animal_dmg_ot": 4.0,
        "building_dmg": 8.0,
        "building_dmg_ot": 1.0,
        "dmg_reduction": 0.7
      },
      {
        "reload": 16.0,
        "player_dmg": 12.0,
        "player_dmg_ot": 2.0,
        "animal_dmg": 25.0,
        "animal_dmg_ot": 5.0,
        "building_dmg": 10.0,
        "building_dmg_ot": 2.0,
        "dmg_reduction": 0.9
      }
    ]
  },
  "polar-bear": {
    "reference": "Polar Bear",
    "source": "https://tamingio.fandom.com/wiki/Polar_Bear",
    "hp": [
      300.0,
      500.0,
      1250.0
    ],
    "bite": [
      5.0,
      9.0,
      22.0
    ],
    "speed": [
      210.0,
      250.0,
      260.0
    ],
    "weight": [
      10.0,
      300.0,
      800.0
    ],
    "regen": [
      2.0,
      2.0,
      2.0
    ],
    "regenDelay": [
      15.0,
      15.0,
      15.0
    ],
    "types": [
      "ice"
    ],
    "tame": 18.0,
    "tool": "slingshot",
    "mountable": true,
    "shieldable": false,
    "ability": "glacier",
    "skillName": "Glacier Falls",
    "skillStats": [
      {
        "reload": 35.0,
        "player_dmg": 10.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 20.0,
        "animal_dmg_ot": 3.0,
        "building_dmg": 20.0,
        "building_dmg_ot": 4.0
      },
      {
        "reload": 32.0,
        "player_dmg": 15.0,
        "player_dmg_ot": 2.0,
        "animal_dmg": 30.0,
        "animal_dmg_ot": 4.0,
        "building_dmg": 40.0,
        "building_dmg_ot": 5.0
      },
      {
        "reload": 30.0,
        "player_dmg": 25.0,
        "player_dmg_ot": 2.0,
        "animal_dmg": 50.0,
        "animal_dmg_ot": 5.0,
        "building_dmg": 60.0,
        "building_dmg_ot": 6.0
      }
    ]
  },
  "reindeer": {
    "reference": "Reindeer",
    "source": "https://tamingio.fandom.com/wiki/Reindeer",
    "hp": [
      300.0,
      800.0,
      1400.0
    ],
    "bite": [
      4.0,
      10.0,
      22.0
    ],
    "speed": [
      290.0,
      310.0,
      390.0
    ],
    "weight": [
      10.0,
      200.0,
      400.0
    ],
    "regen": [
      4.0,
      4.0,
      4.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "normal"
    ],
    "tame": 6.0,
    "tool": "appletor",
    "mountable": true,
    "shieldable": false,
    "ability": "gift-dash",
    "skillName": "Christmas Dash",
    "skillStats": [
      {
        "reload": 28.0,
        "player_dmg": 1.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 2.0,
        "animal_dmg_ot": 2.0,
        "building_dmg": 1.0,
        "building_dmg_ot": 1.0,
        "speed_bonus": 150.0
      },
      {
        "reload": 24.0,
        "player_dmg": 1.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 3.0,
        "animal_dmg_ot": 3.0,
        "building_dmg": 1.0,
        "building_dmg_ot": 1.0,
        "speed_bonus": 250.0
      },
      {
        "reload": 20.0,
        "player_dmg": 2.0,
        "player_dmg_ot": 2.0,
        "animal_dmg": 4.0,
        "animal_dmg_ot": 4.0,
        "building_dmg": 2.0,
        "building_dmg_ot": 2.0,
        "speed_bonus": 350.0
      }
    ]
  },
  "bat": {
    "reference": "Bat",
    "source": "https://tamingio.fandom.com/wiki/Bat",
    "hp": [
      150.0,
      300.0,
      700.0
    ],
    "bite": [
      4.0,
      10.0,
      15.0
    ],
    "speed": [
      250.0,
      270.0,
      330.0
    ],
    "weight": [
      5.0,
      30.0,
      40.0
    ],
    "regen": [
      3.0,
      3.0,
      3.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "shadow"
    ],
    "tame": 18.0,
    "tool": "slingshot",
    "mountable": false,
    "shieldable": false,
    "ability": "drain-bite",
    "skillName": "Vampiric Bite",
    "skillStats": [
      {
        "reload": 24.0,
        "player_dmg": 10.0,
        "animal_dmg": 20.0,
        "building_dmg": 5.0,
        "vampirism": 2.0
      },
      {
        "reload": 22.0,
        "player_dmg": 17.0,
        "animal_dmg": 35.0,
        "building_dmg": 10.0,
        "vampirism": 2.0
      },
      {
        "reload": 20.0,
        "player_dmg": 25.0,
        "animal_dmg": 50.0,
        "building_dmg": 20.0,
        "vampirism": 3.0
      }
    ]
  },
  "black-cat": {
    "reference": "Black Cat",
    "source": "https://tamingio.fandom.com/wiki/Black_Cat",
    "hp": [
      200.0,
      350.0,
      800.0
    ],
    "bite": [
      4.0,
      9.0,
      20.0
    ],
    "speed": [
      260.0,
      300.0,
      340.0
    ],
    "weight": [
      10.0,
      150.0,
      300.0
    ],
    "regen": [
      3.0,
      3.0,
      3.0
    ],
    "regenDelay": [
      15.0,
      15.0,
      15.0
    ],
    "types": [
      "shadow"
    ],
    "tame": 8.0,
    "tool": "appletor",
    "mountable": true,
    "shieldable": true,
    "ability": "dice",
    "skillName": "Lucky Dice",
    "skillStats": [
      {
        "reload": 18.0,
        "dmg_reduction": 0.2,
        "increase_attack": 1.14,
        "heal_ot": 5.0
      },
      {
        "reload": 15.0,
        "dmg_reduction": 0.4,
        "increase_attack": 1.2,
        "heal_ot": 10.0
      },
      {
        "reload": 12.0,
        "dmg_reduction": 0.6,
        "increase_attack": 1.25,
        "heal_ot": 15.0
      }
    ]
  },
  "spider": {
    "reference": "Black Spider",
    "source": "https://tamingio.fandom.com/wiki/Black_Spider",
    "hp": [
      200.0,
      400.0,
      800.0
    ],
    "bite": [
      7.0,
      15.0,
      22.0
    ],
    "speed": [
      240.0,
      260.0,
      320.0
    ],
    "weight": [
      10.0,
      150.0,
      300.0
    ],
    "regen": [
      1.0,
      1.0,
      2.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "poison"
    ],
    "tame": 10.0,
    "tool": "slingshot",
    "mountable": true,
    "shieldable": true,
    "ability": "venom-bite",
    "skillName": "Venomous Bite",
    "skillStats": [
      {
        "reload": 22.0,
        "player_dmg": 10.0,
        "animal_dmg": 20.0
      },
      {
        "reload": 20.0,
        "player_dmg": 17.0,
        "animal_dmg": 35.0
      },
      {
        "reload": 18.0,
        "player_dmg": 25.0,
        "animal_dmg": 50.0
      }
    ]
  },
  "raven": {
    "reference": "Raven",
    "source": "https://tamingio.fandom.com/wiki/Raven",
    "hp": [
      200.0,
      300.0,
      900.0
    ],
    "bite": [
      4.0,
      12.0,
      20.0
    ],
    "speed": [
      220.0,
      270.0,
      300.0
    ],
    "weight": [
      5.0,
      30.0,
      40.0
    ],
    "regen": [
      2.0,
      2.0,
      2.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "shadow"
    ],
    "tame": 18.0,
    "tool": "slingshot",
    "mountable": true,
    "shieldable": true,
    "ability": "fear",
    "skillName": "Feather of Fear",
    "skillStats": [
      {
        "reload": 23.0,
        "slowdown": 0.95,
        "defense_malus": 0.95
      },
      {
        "reload": 20.0,
        "slowdown": 0.9,
        "defense_malus": 0.9
      },
      {
        "reload": 16.0,
        "slowdown": 0.85,
        "defense_malus": 0.86
      }
    ]
  },
  "glow-moth": {
    "reference": "Giant Moth",
    "source": "https://tamingio.fandom.com/wiki/Giant_Moth",
    "hp": [
      200.0,
      300.0,
      900.0
    ],
    "bite": [
      3.0,
      4.0,
      14.0
    ],
    "speed": [
      260.0,
      280.0,
      320.0
    ],
    "weight": [
      10.0,
      50.0,
      150.0
    ],
    "regen": [
      3.0,
      3.0,
      3.0
    ],
    "regenDelay": [
      10.0,
      10.0,
      10.0
    ],
    "types": [
      "insect"
    ],
    "tame": 12.0,
    "tool": "appletor",
    "mountable": true,
    "shieldable": true,
    "ability": "fog",
    "skillName": "Tetanizing Fog",
    "skillStats": [
      {
        "reload": 20.0,
        "player_dmg": 0.0,
        "player_dmg_ot": 0.0,
        "animal_dmg": 1.0,
        "animal_dmg_ot": 1.0
      },
      {
        "reload": 17.0,
        "player_dmg": 1.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 2.0,
        "animal_dmg_ot": 2.0
      },
      {
        "reload": 14.0,
        "player_dmg": 1.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 3.0,
        "animal_dmg_ot": 3.0
      }
    ]
  },
  "camel": {
    "reference": "Camel",
    "source": "https://tamingio.fandom.com/wiki/Camel",
    "hp": [
      200.0,
      500.0,
      1000.0
    ],
    "bite": [
      4.0,
      10.0,
      20.0
    ],
    "speed": [
      250.0,
      280.0,
      320.0
    ],
    "weight": [
      10.0,
      250.0,
      550.0
    ],
    "regen": [
      2.0,
      2.0,
      2.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "water"
    ],
    "tame": 10.0,
    "tool": "appletor",
    "mountable": true,
    "shieldable": true,
    "ability": "spit",
    "skillName": "Torential Spit",
    "skillStats": [
      {
        "reload": 28.0,
        "player_dmg": 3.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 6.0,
        "animal_dmg_ot": 3.0,
        "building_dmg": 2.0,
        "building_dmg_ot": 1.0,
        "speed_bonus": -50.0,
        "slowdown": 0.8
      },
      {
        "reload": 24.0,
        "player_dmg": 4.0,
        "player_dmg_ot": 2.0,
        "animal_dmg": 8.0,
        "animal_dmg_ot": 4.0,
        "building_dmg": 4.0,
        "building_dmg_ot": 1.0,
        "speed_bonus": -65.0,
        "slowdown": 0.7
      },
      {
        "reload": 20.0,
        "player_dmg": 5.0,
        "player_dmg_ot": 2.0,
        "animal_dmg": 10.0,
        "animal_dmg_ot": 5.0,
        "building_dmg": 6.0,
        "building_dmg_ot": 1.0,
        "speed_bonus": -80.0,
        "slowdown": 0.6
      }
    ]
  },
  "scorpion": {
    "reference": "Yellow Scorpion",
    "source": "https://tamingio.fandom.com/wiki/Yellow_Scorpion",
    "hp": [
      300.0,
      700.0,
      1400.0
    ],
    "bite": [
      7.0,
      14.0,
      28.0
    ],
    "speed": [
      220.0,
      240.0,
      270.0
    ],
    "weight": [
      30.0,
      250.0,
      550.0
    ],
    "regen": [
      1.0,
      1.0,
      1.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "poison"
    ],
    "tame": 14.0,
    "tool": "slingshot",
    "mountable": true,
    "shieldable": false,
    "ability": "sting",
    "skillName": "Venomous Sting",
    "skillStats": [
      {
        "reload": 18.0,
        "player_dmg": 5.0,
        "animal_dmg": 10.0,
        "building_dmg": 5.0
      },
      {
        "reload": 14.0,
        "player_dmg": 10.0,
        "animal_dmg": 20.0,
        "building_dmg": 10.0
      },
      {
        "reload": 11.0,
        "player_dmg": 15.0,
        "animal_dmg": 30.0,
        "building_dmg": 20.0
      }
    ]
  },
  "armadillo": {
    "reference": "Armadillo",
    "source": "https://tamingio.fandom.com/wiki/Armadillo",
    "hp": [
      400.0,
      800.0,
      1500.0
    ],
    "bite": [
      3.0,
      6.0,
      12.0
    ],
    "speed": [
      220.0,
      270.0,
      300.0
    ],
    "weight": [
      10.0,
      180.0,
      350.0
    ],
    "regen": [
      3.0,
      3.0,
      3.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "rock"
    ],
    "tame": 14.0,
    "tool": "slingshot",
    "mountable": true,
    "shieldable": true,
    "ability": "shell",
    "skillName": "Cannon Shell",
    "skillStats": [
      {
        "reload": 35.0,
        "player_dmg": 5.0,
        "player_dmg_ot": 0.0,
        "animal_dmg": 10.0,
        "animal_dmg_ot": 1.0,
        "building_dmg": 20,
        "building_dmg_ot": 1,
        "speed_bonus": 100.0,
        "dmg_reduction": 0.4
      },
      {
        "reload": 30.0,
        "player_dmg": 10.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 20.0,
        "animal_dmg_ot": 2.0,
        "building_dmg": 30,
        "building_dmg_ot": 2,
        "speed_bonus": 200.0,
        "dmg_reduction": 0.6
      },
      {
        "reload": 25.0,
        "player_dmg": 15.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 30.0,
        "animal_dmg_ot": 3.0,
        "building_dmg": 40,
        "building_dmg_ot": 3,
        "speed_bonus": 300.0,
        "dmg_reduction": 0.8
      }
    ]
  },
  "snake": {
    "reference": "Oryx",
    "source": "https://tamingio.fandom.com/wiki/Oryx",
    "hp": [
      200.0,
      400.0,
      800.0
    ],
    "bite": [
      3.0,
      6.0,
      18.0
    ],
    "speed": [
      240.0,
      270.0,
      320.0
    ],
    "weight": [
      10.0,
      200.0,
      350.0
    ],
    "regen": [
      3.0,
      3.0,
      3.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "rock"
    ],
    "tame": 12.0,
    "tool": "slingshot",
    "mountable": true,
    "shieldable": true,
    "ability": "chain",
    "skillName": "Chain Spike Trap",
    "skillStats": [
      {
        "reload": 30.0,
        "player_dmg": 2.0,
        "player_dmg_ot": 2.0,
        "animal_dmg": 4.0,
        "animal_dmg_ot": 4.0,
        "building_dmg": 2.0,
        "building_dmg_ot": 2.0,
        "slowdown": 0.8
      },
      {
        "reload": 28.0,
        "player_dmg": 3.0,
        "player_dmg_ot": 3.0,
        "animal_dmg": 6.0,
        "animal_dmg_ot": 6.0,
        "building_dmg": 4.0,
        "building_dmg_ot": 4.0,
        "slowdown": 0.7
      },
      {
        "reload": 25.0,
        "player_dmg": 4.0,
        "player_dmg_ot": 4.0,
        "animal_dmg": 8.0,
        "animal_dmg_ot": 8.0,
        "building_dmg": 6.0,
        "building_dmg_ot": 6.0,
        "slowdown": 0.6
      }
    ]
  },
  "caracal": {
    "reference": "Caracal",
    "source": "https://tamingio.fandom.com/wiki/Caracal",
    "hp": [
      200.0,
      400.0,
      900.0
    ],
    "bite": [
      4.0,
      10.0,
      22.0
    ],
    "speed": [
      210.0,
      260.0,
      290.0
    ],
    "weight": [
      10.0,
      120.0,
      250.0
    ],
    "regen": [
      2.0,
      2.0,
      2.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "normal"
    ],
    "tame": 10.0,
    "tool": "slingshot",
    "mountable": true,
    "shieldable": true,
    "ability": "swag",
    "skillName": "Swag",
    "skillStats": [
      {
        "reload": 28.0
      },
      {
        "reload": 24.0
      },
      {
        "reload": 18.0
      }
    ]
  },
  "crab": {
    "reference": "Sea Crab",
    "source": "https://tamingio.fandom.com/wiki/Sea_Crab",
    "hp": [
      300.0,
      700.0,
      2000.0
    ],
    "bite": [
      4.0,
      10.0,
      22.0
    ],
    "speed": [
      200.0,
      220.0,
      240.0
    ],
    "weight": [
      15.0,
      400.0,
      1000.0
    ],
    "regen": [
      1.0,
      1.0,
      1.0
    ],
    "regenDelay": [
      15.0,
      15.0,
      15.0
    ],
    "types": [
      "water"
    ],
    "tame": 14.0,
    "tool": "slingshot",
    "mountable": true,
    "shieldable": true,
    "ability": "bubble",
    "skillName": "Time-Stopping Bubble",
    "skillStats": [
      {
        "reload": 40.0,
        "slowdown": 0.8,
        "dmg_reduction": 0.05,
        "building_defense": 0.05,
        "player_dmg_ot": 0.0,
        "animal_dmg_ot": 1.0
      },
      {
        "reload": 35.0,
        "slowdown": 0.65,
        "dmg_reduction": 0.1,
        "building_defense": 0.1,
        "player_dmg_ot": 1.0,
        "animal_dmg_ot": 2.0
      },
      {
        "reload": 30.0,
        "slowdown": 0.5,
        "dmg_reduction": 0.15,
        "building_defense": 0.15,
        "player_dmg_ot": 1.0,
        "animal_dmg_ot": 3.0
      }
    ]
  },
  "turtle": {
    "reference": "Goldfish",
    "source": "https://tamingio.fandom.com/wiki/Goldfish",
    "hp": [
      200.0,
      400.0,
      1500.0
    ],
    "bite": [
      1.0,
      2.0,
      20.0
    ],
    "speed": [
      170.0,
      200.0,
      235.0
    ],
    "weight": [
      150.0,
      300.0,
      800.0
    ],
    "regen": [
      3.0,
      3.0,
      3.0
    ],
    "regenDelay": [
      15.0,
      15.0,
      15.0
    ],
    "types": [
      "water"
    ],
    "tame": 12.0,
    "tool": "appletor",
    "mountable": true,
    "shieldable": false,
    "ability": "tsunami",
    "skillName": "Tsunami",
    "skillStats": [
      {
        "reload": 20.0,
        "player_dmg": 0.0,
        "player_dmg_ot": 0.0,
        "animal_dmg": 0.0,
        "animal_dmg_ot": 0.0,
        "building_dmg": 0.0,
        "building_dmg_ot": 0.0
      },
      {
        "reload": 20.0,
        "player_dmg": 0.0,
        "player_dmg_ot": 0.0,
        "animal_dmg": 0.0,
        "animal_dmg_ot": 0.0,
        "building_dmg": 0.0,
        "building_dmg_ot": 0.0
      },
      {
        "reload": 35.0,
        "player_dmg": 10.0,
        "player_dmg_ot": 8.0,
        "animal_dmg": 20.0,
        "animal_dmg_ot": 16.0,
        "building_dmg": 70.0,
        "building_dmg_ot": 16.0
      }
    ]
  },
  "seal": {
    "reference": "Seal",
    "source": "https://tamingio.fandom.com/wiki/Seal",
    "hp": [
      400.0,
      1000.0,
      2000.0
    ],
    "bite": [
      3.0,
      7.0,
      14.0
    ],
    "speed": [
      210.0,
      250.0,
      290.0
    ],
    "weight": [
      10.0,
      280.0,
      650.0
    ],
    "regen": [
      2.0,
      2.0,
      2.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "ice"
    ],
    "tame": 10.0,
    "tool": "appletor",
    "mountable": true,
    "shieldable": true,
    "ability": "ice-dash",
    "skillName": "Icy River Rush",
    "skillStats": [
      {
        "reload": 40.0,
        "player_dmg": 2.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 4.0,
        "animal_dmg_ot": 3.0,
        "building_dmg": 3.0,
        "building_dmg_ot": 4.0,
        "speed_bonus": 150.0
      },
      {
        "reload": 35.0,
        "player_dmg": 2.0,
        "player_dmg_ot": 2.0,
        "animal_dmg": 5.0,
        "animal_dmg_ot": 4.0,
        "building_dmg": 5.0,
        "building_dmg_ot": 5.0,
        "speed_bonus": 250.0
      },
      {
        "reload": 30.0,
        "player_dmg": 3.0,
        "player_dmg_ot": 3.0,
        "animal_dmg": 6.0,
        "animal_dmg_ot": 6.0,
        "building_dmg": 6.0,
        "building_dmg_ot": 6.0,
        "speed_bonus": 300.0
      }
    ]
  },
  "axolotl": {
    "reference": "Axolotl",
    "source": "https://tamingio.fandom.com/wiki/Axolotl",
    "hp": [
      150.0,
      300.0,
      800.0
    ],
    "bite": [
      3.0,
      4.0,
      12.0
    ],
    "speed": [
      260.0,
      270.0,
      330.0
    ],
    "weight": [
      10.0,
      140.0,
      280.0
    ],
    "regen": [
      4.0,
      4.0,
      4.0
    ],
    "regenDelay": [
      5.0,
      5.0,
      5.0
    ],
    "types": [
      "water"
    ],
    "tame": 10.0,
    "tool": "appletor",
    "mountable": true,
    "shieldable": true,
    "ability": "clone",
    "skillName": "Minion Invocation",
    "skillStats": [
      {
        "reload": 45.0,
        "clone_life": 12.0
      },
      {
        "reload": 45.0,
        "clone_life": 12.0
      },
      {
        "reload": 45.0,
        "clone_life": 12.0
      }
    ]
  },
  "shark": {
    "reference": "Shark",
    "source": "https://tamingio.fandom.com/wiki/Shark",
    "hp": [
      300.0,
      600.0,
      1400.0
    ],
    "bite": [
      6.0,
      12.0,
      30.0
    ],
    "speed": [
      220.0,
      260.0,
      300.0
    ],
    "weight": [
      10.0,
      300.0,
      700.0
    ],
    "regen": [
      1.0,
      1.0,
      1.0
    ],
    "regenDelay": [
      22.0,
      22.0,
      22.0
    ],
    "types": [
      "combat"
    ],
    "tame": 10.0,
    "tool": "slingshot",
    "mountable": true,
    "shieldable": true,
    "ability": "jaws",
    "skillName": "Triple Jaws",
    "skillStats": [
      {
        "reload": 30.0,
        "player_dmg": 5.0,
        "animal_dmg": 10.0,
        "building_dmg": 10.0
      },
      {
        "reload": 26.0,
        "player_dmg": 10.0,
        "animal_dmg": 20.0,
        "building_dmg": 20.0
      },
      {
        "reload": 22.0,
        "player_dmg": 15.0,
        "animal_dmg": 30.0,
        "building_dmg": 30.0
      }
    ]
  },
  "salamander": {
    "reference": "Salamander",
    "source": "https://tamingio.fandom.com/wiki/Salamander",
    "hp": [
      200.0,
      400.0,
      900.0
    ],
    "bite": [
      3.0,
      9.0,
      15.0
    ],
    "speed": [
      240.0,
      280.0,
      340.0
    ],
    "weight": [
      15.0,
      300.0,
      700.0
    ],
    "regen": [
      3.0,
      3.0,
      3.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "fire"
    ],
    "tame": 14.0,
    "tool": "appletor",
    "mountable": true,
    "shieldable": true,
    "ability": "lava-spit",
    "skillName": "Lava Spit",
    "skillStats": [
      {
        "reload": 26.0
      },
      {
        "reload": 24.0
      },
      {
        "reload": 22.0
      }
    ]
  },
  "magma-boar": {
    "reference": "Lava Golem",
    "source": "https://tamingio.fandom.com/wiki/Lava_Golem",
    "hp": [
      400.0,
      900.0,
      1400.0
    ],
    "bite": [
      4.0,
      10.0,
      22.0
    ],
    "speed": [
      190.0,
      230.0,
      270.0
    ],
    "weight": [
      150.0,
      600.0,
      1200.0
    ],
    "regen": [
      2.0,
      2.0,
      2.0
    ],
    "regenDelay": [
      10.0,
      10.0,
      10.0
    ],
    "types": [
      "fire"
    ],
    "tame": 10.0,
    "tool": "appletor",
    "mountable": true,
    "shieldable": true,
    "ability": "magma-heal",
    "skillName": "Magma Genesis",
    "skillStats": [
      {
        "reload": 55.0,
        "dmg_reduction": 0.99,
        "heal_ot": 25.0
      },
      {
        "reload": 50.0,
        "dmg_reduction": 0.99,
        "heal_ot": 50.0
      },
      {
        "reload": 45.0,
        "dmg_reduction": 0.99,
        "heal_ot": 100.0
      }
    ]
  },
  "ember-fox": {
    "reference": "Fennec Fox",
    "source": "https://tamingio.fandom.com/wiki/Fennec_Fox",
    "hp": [
      200.0,
      350.0,
      900.0
    ],
    "bite": [
      4.0,
      8.0,
      19.0
    ],
    "speed": [
      240.0,
      290.0,
      320.0
    ],
    "weight": [
      10.0,
      150.0,
      300.0
    ],
    "regen": [
      2.0,
      2.0,
      2.0
    ],
    "regenDelay": [
      15.0,
      15.0,
      15.0
    ],
    "types": [
      "fire"
    ],
    "tame": 14.0,
    "tool": "appletor",
    "mountable": true,
    "shieldable": true,
    "ability": "wildfire",
    "skillName": "Wild Fire",
    "skillStats": [
      {
        "reload": 25.0,
        "player_dmg": 2.0,
        "player_dmg_ot": 2.0,
        "animal_dmg": 4.0,
        "animal_dmg_ot": 4.0,
        "building_dmg": 1.0,
        "building_dmg_ot": 1.0
      },
      {
        "reload": 22.0,
        "player_dmg": 2.0,
        "player_dmg_ot": 2.0,
        "animal_dmg": 5.0,
        "animal_dmg_ot": 5.0,
        "building_dmg": 2.0,
        "building_dmg_ot": 2.0
      },
      {
        "reload": 17.0,
        "player_dmg": 3.0,
        "player_dmg_ot": 3.0,
        "animal_dmg": 6.0,
        "animal_dmg_ot": 6.0,
        "building_dmg": 3.0,
        "building_dmg_ot": 3.0
      }
    ]
  },
  "phoenix": {
    "reference": "Fire Dragon",
    "source": "https://tamingio.fandom.com/wiki/Fire_Dragon",
    "hp": [
      300.0,
      900.0,
      1500.0
    ],
    "bite": [
      6.0,
      12.0,
      30.0
    ],
    "speed": [
      210.0,
      230.0,
      270.0
    ],
    "weight": [
      10.0,
      300.0,
      800.0
    ],
    "regen": [
      5.0,
      5.0,
      5.0
    ],
    "regenDelay": [
      15.0,
      15.0,
      15.0
    ],
    "types": [
      "dragon",
      "fire"
    ],
    "tame": 8.0,
    "tool": "slingshot",
    "mountable": true,
    "shieldable": true,
    "ability": "fire-blast",
    "skillName": "Blazing Blast",
    "skillStats": [
      {
        "reload": 24.0,
        "player_dmg": 5.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 10.0,
        "animal_dmg_ot": 3.0,
        "building_dmg": 6.0,
        "building_dmg_ot": 4.0,
        "speed_bonus": -50.0
      },
      {
        "reload": 22.0,
        "player_dmg": 7.0,
        "player_dmg_ot": 2.0,
        "animal_dmg": 14.0,
        "animal_dmg_ot": 4.0,
        "building_dmg": 14.0,
        "building_dmg_ot": 6.0,
        "speed_bonus": -65.0
      },
      {
        "reload": 20.0,
        "player_dmg": 9.0,
        "player_dmg_ot": 2.0,
        "animal_dmg": 28.0,
        "animal_dmg_ot": 5.0,
        "building_dmg": 20.0,
        "building_dmg_ot": 8.0,
        "speed_bonus": -80.0
      }
    ]
  },
  "grove-spirit": {
    "reference": "Plant Fairy",
    "source": "https://tamingio.fandom.com/wiki/Plant_Fairy",
    "hp": [
      150.0,
      300.0,
      800.0
    ],
    "bite": [
      3.0,
      8.0,
      14.0
    ],
    "speed": [
      270.0,
      290.0,
      390.0
    ],
    "weight": [
      5.0,
      30.0,
      40.0
    ],
    "regen": [
      4.0,
      4.0,
      4.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "fairy",
      "plant"
    ],
    "tame": 12.0,
    "tool": "appletor",
    "mountable": false,
    "shieldable": false,
    "ability": "plant-ball",
    "skillName": "Plant Ball",
    "skillStats": [
      {
        "reload": 14.0,
        "player_dmg": 5.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 10.0,
        "animal_dmg_ot": 2.0,
        "vampirism": 1.0
      },
      {
        "reload": 12.0,
        "player_dmg": 10.0,
        "player_dmg_ot": 2.0,
        "animal_dmg": 20.0,
        "animal_dmg_ot": 5.0,
        "vampirism": 2.0
      },
      {
        "reload": 8.0,
        "player_dmg": 15.0,
        "player_dmg_ot": 3.0,
        "animal_dmg": 30.0,
        "animal_dmg_ot": 7.0,
        "vampirism": 3.0
      }
    ]
  },
  "ice-spirit": {
    "reference": "Ice Golem",
    "source": "https://tamingio.fandom.com/wiki/Ice_Golem",
    "hp": [
      600.0,
      1400.0,
      2500.0
    ],
    "bite": [
      5.0,
      11.0,
      24.0
    ],
    "speed": [
      190.0,
      220.0,
      240.0
    ],
    "weight": [
      150.0,
      600.0,
      1200.0
    ],
    "regen": [
      3.0,
      3.0,
      3.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "ice"
    ],
    "tame": 10.0,
    "tool": "appletor",
    "mountable": true,
    "shieldable": false,
    "ability": "golem-shield",
    "skillName": "Ice Shield",
    "skillStats": [
      {
        "reload": 38.0,
        "dmg_reduction": 0.2
      },
      {
        "reload": 36.0,
        "dmg_reduction": 0.4
      },
      {
        "reload": 34.0,
        "dmg_reduction": 0.6
      }
    ]
  },
  "dune-spirit": {
    "reference": "Menhir",
    "source": "https://tamingio.fandom.com/wiki/Menhir",
    "hp": [
      500.0,
      1200.0,
      2800.0
    ],
    "bite": [
      7.0,
      15.0,
      24.0
    ],
    "speed": [
      150.0,
      180.0,
      220.0
    ],
    "weight": [
      150.0,
      600.0,
      1200.0
    ],
    "regen": [
      3.0,
      4.0,
      4.0
    ],
    "regenDelay": [
      15.0,
      15.0,
      15.0
    ],
    "types": [
      "rock"
    ],
    "tame": 10.0,
    "tool": "slingshot",
    "mountable": false,
    "shieldable": false,
    "ability": "burst",
    "skillName": "Burst",
    "skillStats": [
      {
        "reload": 30.0,
        "player_dmg": 0.0,
        "animal_dmg": 0.0,
        "building_dmg": 0.0
      },
      {
        "reload": 30.0,
        "player_dmg": 0.0,
        "animal_dmg": 0.0,
        "building_dmg": 0.0
      },
      {
        "reload": 30.0,
        "player_dmg": 70.0,
        "animal_dmg": 140.0,
        "building_dmg": 500.0
      }
    ]
  },
  "fire-fairy": {
    "reference": "Fire Fairy",
    "source": "https://tamingio.fandom.com/wiki/Fire_Fairy",
    "hp": [
      150.0,
      300.0,
      800.0
    ],
    "bite": [
      3.0,
      8.0,
      14.0
    ],
    "speed": [
      270.0,
      290.0,
      390.0
    ],
    "weight": [
      5.0,
      30.0,
      40.0
    ],
    "regen": [
      4.0,
      4.0,
      4.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "fairy",
      "fire"
    ],
    "tame": 12.0,
    "tool": "appletor",
    "mountable": false,
    "shieldable": false,
    "ability": "fire-ball",
    "skillName": "Fire Ball",
    "skillStats": [
      {
        "reload": 14.0,
        "player_dmg": 2.0,
        "player_dmg_ot": 0.0,
        "animal_dmg": 5.0,
        "animal_dmg_ot": 1.0,
        "building_dmg": 5.0,
        "building_dmg_ot": 1.0
      },
      {
        "reload": 12.0,
        "player_dmg": 5.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 10.0,
        "animal_dmg_ot": 2.0,
        "building_dmg": 10.0,
        "building_dmg_ot": 2.0
      },
      {
        "reload": 10.0,
        "player_dmg": 15.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 30.0,
        "animal_dmg_ot": 3.0,
        "building_dmg": 15.0,
        "building_dmg_ot": 3.0
      }
    ]
  },
  "water-fairy": {
    "reference": "Water Fairy",
    "source": "https://tamingio.fandom.com/wiki/Water_Fairy",
    "hp": [
      150.0,
      300.0,
      800.0
    ],
    "bite": [
      3.0,
      8.0,
      14.0
    ],
    "speed": [
      270.0,
      290.0,
      390.0
    ],
    "weight": [
      5.0,
      30.0,
      40.0
    ],
    "regen": [
      4.0,
      4.0,
      4.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "fairy",
      "water"
    ],
    "tame": 12.0,
    "tool": "appletor",
    "mountable": false,
    "shieldable": false,
    "ability": "water-ball",
    "skillName": "Water Ball",
    "skillStats": [
      {
        "reload": 14.0,
        "player_dmg": 4.0,
        "player_dmg_ot": 0.0,
        "animal_dmg": 8.0,
        "animal_dmg_ot": 1.0,
        "heal_ot": 10.0
      },
      {
        "reload": 12.0,
        "player_dmg": 8.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 16.0,
        "animal_dmg_ot": 2.0,
        "heal_ot": 18.0
      },
      {
        "reload": 10.0,
        "player_dmg": 12.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 24.0,
        "animal_dmg_ot": 3.0,
        "heal_ot": 25.0
      }
    ]
  },
  "iceberg": {
    "reference": "Iceberg",
    "source": "https://tamingio.fandom.com/wiki/Iceberg",
    "hp": [
      300.0,
      800.0,
      1400.0
    ],
    "bite": [
      7.0,
      16.0,
      30.0
    ],
    "speed": [
      200.0,
      220.0,
      260.0
    ],
    "weight": [
      150.0,
      600.0,
      1200.0
    ],
    "regen": [
      2.0,
      2.0,
      2.0
    ],
    "regenDelay": [
      15.0,
      15.0,
      15.0
    ],
    "types": [
      "ice"
    ],
    "tame": 10.0,
    "tool": "appletor",
    "mountable": true,
    "shieldable": true,
    "ability": "ice-sword",
    "skillName": "Ice Sword",
    "skillStats": [
      {
        "reload": 32.0,
        "player_dmg_ot": 1.0,
        "animal_dmg_ot": 2.0,
        "building_dmg_ot": 2.0,
        "player_dmg": 1.0,
        "animal_dmg": 2.0
      },
      {
        "reload": 28.0,
        "player_dmg_ot": 1.0,
        "animal_dmg_ot": 3.0,
        "building_dmg_ot": 3.0,
        "player_dmg": 1.0,
        "animal_dmg": 3.0
      },
      {
        "reload": 24.0,
        "player_dmg_ot": 3.0,
        "animal_dmg_ot": 7.0,
        "building_dmg_ot": 7.0,
        "player_dmg": 3.0,
        "animal_dmg": 7.0
      }
    ]
  },
  "living-mushroom": {
    "reference": "Living Mushroom",
    "source": "https://tamingio.fandom.com/wiki/Living_Mushroom",
    "hp": [
      400.0,
      1000.0,
      2000.0
    ],
    "bite": [
      6.0,
      14.0,
      28.0
    ],
    "speed": [
      210.0,
      255.0,
      280.0
    ],
    "weight": [
      50.0,
      300.0,
      900.0
    ],
    "regen": [
      2.0,
      2.0,
      2.0
    ],
    "regenDelay": [
      15.0,
      15.0,
      15.0
    ],
    "types": [
      "combat"
    ],
    "tame": 8.0,
    "tool": "appletor",
    "mountable": true,
    "shieldable": true,
    "ability": "punch",
    "skillName": "Mega Punch",
    "skillStats": [
      {
        "reload": 26.0,
        "player_dmg": 27.0,
        "animal_dmg": 55.0,
        "building_dmg": 60.0
      },
      {
        "reload": 24.0,
        "player_dmg": 35.0,
        "animal_dmg": 70.0,
        "building_dmg": 80.0
      },
      {
        "reload": 22.0,
        "player_dmg": 42.0,
        "animal_dmg": 85.0,
        "building_dmg": 100.0
      }
    ]
  },
  "white-spider": {
    "reference": "White Spider",
    "source": "https://tamingio.fandom.com/wiki/White_Spider",
    "hp": [
      300.0,
      700.0,
      1200.0
    ],
    "bite": [
      6.0,
      11.0,
      16.0
    ],
    "speed": [
      220.0,
      240.0,
      280.0
    ],
    "weight": [
      10.0,
      150.0,
      300.0
    ],
    "regen": [
      4.0,
      4.0,
      4.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "normal"
    ],
    "tame": 10.0,
    "tool": "slingshot",
    "mountable": true,
    "shieldable": true,
    "ability": "web",
    "skillName": "Wonderful Web",
    "skillStats": [
      {
        "reload": 22.0,
        "slowdown": 0.6,
        "heal_ot": 5.0
      },
      {
        "reload": 18.0,
        "slowdown": 0.45,
        "heal_ot": 6.0
      },
      {
        "reload": 14.0,
        "slowdown": 0.3,
        "heal_ot": 7.0
      }
    ]
  },
  "stone-golem": {
    "reference": "Stone Golem",
    "source": "https://tamingio.fandom.com/wiki/Stone_Golem",
    "hp": [
      600.0,
      1400.0,
      2500.0
    ],
    "bite": [
      5.0,
      11.0,
      24.0
    ],
    "speed": [
      190.0,
      220.0,
      240.0
    ],
    "weight": [
      150.0,
      600.0,
      1200.0
    ],
    "regen": [
      3.0,
      3.0,
      3.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "rock"
    ],
    "tame": 10.0,
    "tool": "appletor",
    "mountable": true,
    "shieldable": true,
    "ability": "stone-shield",
    "skillName": "Defensive Spike",
    "skillStats": [
      {
        "reload": 32.0,
        "dmg_reduction": 0.8
      },
      {
        "reload": 30.0,
        "dmg_reduction": 0.9
      },
      {
        "reload": 28.0,
        "dmg_reduction": 0.95
      }
    ]
  },
  "volcanic-golem": {
    "reference": "Volcanic Golem",
    "source": "https://tamingio.fandom.com/wiki/Volcanic_Golem",
    "hp": [
      500.0,
      1100.0,
      2200.0
    ],
    "bite": [
      5.0,
      11.0,
      28.0
    ],
    "speed": [
      190.0,
      230.0,
      260.0
    ],
    "weight": [
      150.0,
      500.0,
      1000.0
    ],
    "regen": [
      2.0,
      2.0,
      2.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "rock",
      "fire"
    ],
    "tame": 10.0,
    "tool": "appletor",
    "mountable": true,
    "shieldable": true,
    "ability": "smog",
    "skillName": "Scorching Smog",
    "skillStats": [
      {
        "reload": 30.0,
        "player_dmg": 2.0,
        "player_dmg_ot": 1.0,
        "animal_dmg": 5.0,
        "animal_dmg_ot": 3.0,
        "building_dmg": 5.0,
        "building_dmg_ot": 3.0
      },
      {
        "reload": 28.0,
        "player_dmg": 5.0,
        "player_dmg_ot": 2.0,
        "animal_dmg": 10.0,
        "animal_dmg_ot": 4.0,
        "building_dmg": 15.0,
        "building_dmg_ot": 4.0
      },
      {
        "reload": 26.0,
        "player_dmg": 10.0,
        "player_dmg_ot": 3.0,
        "animal_dmg": 20.0,
        "animal_dmg_ot": 6.0,
        "building_dmg": 30.0,
        "building_dmg_ot": 6.0
      }
    ]
  },
  "mantle": {
    "reference": "Mantle",
    "source": "https://tamingio.fandom.com/wiki/Mantle",
    "hp": [
      700.0,
      1600.0,
      3000.0
    ],
    "bite": [
      6.0,
      12.0,
      26.0
    ],
    "speed": [
      170.0,
      190.0,
      210.0
    ],
    "weight": [
      200.0,
      800.0,
      2000.0
    ],
    "regen": [
      3.0,
      3.0,
      3.0
    ],
    "regenDelay": [
      30.0,
      30.0,
      30.0
    ],
    "types": [
      "rock"
    ],
    "tame": 10.0,
    "tool": "appletor",
    "mountable": true,
    "shieldable": false,
    "ability": "lock",
    "skillName": "Boulderlock",
    "skillStats": [
      {
        "reload": 32.0
      },
      {
        "reload": 30.0
      },
      {
        "reload": 28.0
      }
    ]
  },
  "octopus": {
    "reference": "Octopus",
    "source": "https://tamingio.fandom.com/wiki/Octopus",
    "hp": [
      300.0,
      800.0,
      1400.0
    ],
    "bite": [
      4.0,
      12.0,
      25.0
    ],
    "speed": [
      250.0,
      275.0,
      310.0
    ],
    "weight": [
      10.0,
      150.0,
      300.0
    ],
    "regen": [
      4.0,
      4.0,
      4.0
    ],
    "regenDelay": [
      7.0,
      7.0,
      7.0
    ],
    "types": [
      "water"
    ],
    "tame": 8.0,
    "tool": "slingshot",
    "mountable": true,
    "shieldable": false,
    "ability": "tentacles",
    "skillName": "Sticky Tentacles",
    "skillStats": [
      {
        "reload": 24.0
      },
      {
        "reload": 20.0
      },
      {
        "reload": 16.0
      }
    ]
  }
};
