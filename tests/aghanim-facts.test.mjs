import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { publicQuestionForRound } from "../src/lib/public-question.mjs";

// Recorded from Valve's hero data on 2026-10-06, independently of the question generator.
// Each tuple is hero ID, hero name, ability key, ability name, upgrade item, and upgrade mode.
const valveFacts = {
  npc_dota_hero_antimage: [1, "Anti-Mage", "antimage_blink", "Blink", "scepter", "existing"],
  npc_dota_hero_axe: [2, "Axe", "axe_counter_helix", "Counter Helix", "scepter", "existing"],
  npc_dota_hero_bane: [3, "Bane", "bane_fiends_grip", "Fiend's Grip", "scepter", "existing"],
  npc_dota_hero_crystal_maiden: [5, "Crystal Maiden", "crystal_maiden_crystal_clone", "Crystal Clone", "shard", "new"],
  npc_dota_hero_drow_ranger: [6, "Drow Ranger", "drow_ranger_glacier", "Glacier", "shard", "new"],
  npc_dota_hero_earthshaker: [7, "Earthshaker", "earthshaker_fissure", "Fissure", "shard", "existing"],
  npc_dota_hero_mirana: [9, "Mirana", "mirana_arrow", "Sacred Arrow", "scepter", "existing"],
  npc_dota_hero_morphling: [10, "Morphling", "morphling_replicate", "Morph", "scepter", "existing"],
  npc_dota_hero_nevermore: [11, "Shadow Fiend", "nevermore_requiem", "Requiem of Souls", "scepter", "existing"],
  npc_dota_hero_phantom_lancer: [12, "Phantom Lancer", "phantom_lancer_juxtapose", "Juxtapose", "shard", "existing"],
  npc_dota_hero_puck: [13, "Puck", "puck_dream_coil", "Dream Coil", "scepter", "existing"],
  npc_dota_hero_pudge: [14, "Pudge", "pudge_meat_hook", "Meat Hook", "shard", "existing"],
  npc_dota_hero_razor: [15, "Razor", "razor_eye_of_the_storm", "Eye of the Storm", "scepter", "existing"],
  npc_dota_hero_storm_spirit: [17, "Storm Spirit", "storm_spirit_overload", "Overload", "shard", "existing"],
  npc_dota_hero_sven: [18, "Sven", "sven_storm_bolt", "Storm Hammer", "scepter", "existing"],
  npc_dota_hero_tiny: [19, "Tiny", "tiny_tree_channel", "Tree Volley", "scepter", "new"],
  npc_dota_hero_vengefulspirit: [
    20,
    "Vengeful Spirit",
    "vengefulspirit_command_aura",
    "Vengeance Aura",
    "scepter",
    "existing",
  ],
  npc_dota_hero_windrunner: [21, "Windranger", "windrunner_gale_force", "Gale Force", "shard", "new"],
  npc_dota_hero_zuus: [22, "Zeus", "zuus_cloud", "Nimbus", "scepter", "new"],
  npc_dota_hero_kunkka: [23, "Kunkka", "kunkka_ghostship", "Ghostship", "scepter", "existing"],
  npc_dota_hero_lina: [25, "Lina", "lina_flame_cloak", "Flame Cloak", "scepter", "new"],
  npc_dota_hero_lion: [26, "Lion", "lion_mana_drain", "Mana Drain", "shard", "existing"],
  npc_dota_hero_shadow_shaman: [27, "Shadow Shaman", "shadow_shaman_shackles", "Shackles", "scepter", "existing"],
  npc_dota_hero_tidehunter: [29, "Tidehunter", "tidehunter_dead_in_the_water", "Dead in the Water", "shard", "new"],
  npc_dota_hero_witch_doctor: [
    30,
    "Witch Doctor",
    "witch_doctor_voodoo_switcheroo",
    "Voodoo Switcheroo",
    "shard",
    "new",
  ],
  npc_dota_hero_lich: [31, "Lich", "lich_sinister_gaze", "Sinister Gaze", "scepter", "existing"],
  npc_dota_hero_riki: [32, "Riki", "riki_tricks_of_the_trade", "Tricks of the Trade", "scepter", "existing"],
  npc_dota_hero_enigma: [33, "Enigma", "enigma_malefice", "Malefice", "shard", "existing"],
  npc_dota_hero_tinker: [34, "Tinker", "tinker_warp_grenade", "Warp Flare", "shard", "new"],
  npc_dota_hero_sniper: [35, "Sniper", "sniper_concussive_grenade", "Concussive Grenade", "shard", "new"],
  npc_dota_hero_necrolyte: [36, "Necrophos", "necrolyte_death_seeker", "Death Seeker", "shard", "new"],
  npc_dota_hero_beastmaster: [38, "Beastmaster", "beastmaster_drums_of_slom", "Drums of Slom", "scepter", "new"],
  npc_dota_hero_queenofpain: [39, "Queen of Pain", "queenofpain_blink", "Blink", "shard", "existing"],
  npc_dota_hero_venomancer: [40, "Venomancer", "venomancer_noxious_plague", "Noxious Plague", "scepter", "existing"],
  npc_dota_hero_faceless_void: [
    41,
    "Faceless Void",
    "faceless_void_time_walk_reverse",
    "Reverse Time Walk",
    "scepter",
    "new",
  ],
  npc_dota_hero_death_prophet: [43, "Death Prophet", "death_prophet_exorcism", "Exorcism", "scepter", "existing"],
  npc_dota_hero_phantom_assassin: [
    44,
    "Phantom Assassin",
    "phantom_assassin_fan_of_knives",
    "Fan of Knives",
    "scepter",
    "new",
  ],
  npc_dota_hero_pugna: [45, "Pugna", "pugna_life_drain", "Life Drain", "shard", "existing"],
  npc_dota_hero_viper: [47, "Viper", "viper_nose_dive", "Nosedive", "scepter", "new"],
  npc_dota_hero_luna: [48, "Luna", "luna_eclipse", "Eclipse", "scepter", "existing"],
  npc_dota_hero_dragon_knight: [49, "Dragon Knight", "dragon_knight_fireball", "Fireball", "shard", "new"],
  npc_dota_hero_dazzle: [50, "Dazzle", "dazzle_shadow_wave", "Shadow Wave", "scepter", "existing"],
  npc_dota_hero_rattletrap: [51, "Clockwerk", "rattletrap_jetpack", "Jetpack", "shard", "new"],
  npc_dota_hero_leshrac: [52, "Leshrac", "leshrac_greater_lightning_storm", "Nihilism", "scepter", "new"],
  npc_dota_hero_furion: [
    53,
    "Nature's Prophet",
    "furion_curse_of_the_forest",
    "Curse of the Oldgrowth",
    "shard",
    "new",
  ],
  npc_dota_hero_life_stealer: [54, "Lifestealer", "life_stealer_infest", "Infest", "scepter", "existing"],
  npc_dota_hero_dark_seer: [55, "Dark Seer", "dark_seer_surge", "Surge", "shard", "existing"],
  npc_dota_hero_clinkz: [56, "Clinkz", "clinkz_burning_barrage", "Burning Barrage", "shard", "new"],
  npc_dota_hero_omniknight: [57, "Omniknight", "omniknight_purification", "Purification", "shard", "existing"],
  npc_dota_hero_enchantress: [58, "Enchantress", "enchantress_little_friends", "Little Friends", "scepter", "new"],
  npc_dota_hero_huskar: [59, "Huskar", "huskar_berserkers_blood", "Berserker's Blood", "shard", "existing"],
  npc_dota_hero_night_stalker: [
    60,
    "Night Stalker",
    "night_stalker_hunter_in_the_night",
    "Hunter in the Night",
    "scepter",
    "existing",
  ],
  npc_dota_hero_broodmother: [61, "Broodmother", "broodmother_sticky_snare", "Spinner's Snare", "scepter", "new"],
  npc_dota_hero_bounty_hunter: [62, "Bounty Hunter", "bounty_hunter_wind_walk_ally", "Friendly Shadow", "shard", "new"],
  npc_dota_hero_weaver: [63, "Weaver", "weaver_shukuchi", "Shukuchi", "shard", "existing"],
  npc_dota_hero_jakiro: [64, "Jakiro", "jakiro_macropyre", "Macropyre", "scepter", "existing"],
  npc_dota_hero_batrider: [65, "Batrider", "batrider_flaming_lasso", "Flaming Lasso", "scepter", "existing"],
  npc_dota_hero_chen: [66, "Chen", "chen_hand_of_god", "Hand of God", "scepter", "existing"],
  npc_dota_hero_doom_bringer: [69, "Doom", "doom_bringer_doom", "Doom", "scepter", "existing"],
  npc_dota_hero_spirit_breaker: [71, "Spirit Breaker", "spirit_breaker_planar_pocket", "Planar Pocket", "shard", "new"],
  npc_dota_hero_gyrocopter: [72, "Gyrocopter", "gyrocopter_homing_missile", "Homing Missile", "shard", "existing"],
  npc_dota_hero_alchemist: [73, "Alchemist", "alchemist_berserk_potion", "Berserk Potion", "shard", "new"],
  npc_dota_hero_invoker: [74, "Invoker", "invoker_ice_wall", "Ice Wall", "scepter", "existing"],
  npc_dota_hero_obsidian_destroyer: [
    76,
    "Outworld Destroyer",
    "obsidian_destroyer_objurgation",
    "Objurgation",
    "scepter",
    "existing",
  ],
  npc_dota_hero_lycan: [77, "Lycan", "lycan_wolf_bite", "Wolf Bite", "scepter", "new"],
  npc_dota_hero_shadow_demon: [79, "Shadow Demon", "shadow_demon_demonic_cleanse", "Demonic Cleanse", "shard", "new"],
  npc_dota_hero_chaos_knight: [81, "Chaos Knight", "chaos_knight_phantasm", "Phantasm", "scepter", "existing"],
  npc_dota_hero_meepo: [82, "Meepo", "meepo_petrify", "Dig", "shard", "new"],
  npc_dota_hero_treant: [83, "Treant Protector", "treant_eyes_in_the_forest", "Eyes In The Forest", "shard", "new"],
  npc_dota_hero_ogre_magi: [84, "Ogre Magi", "ogre_magi_smash", "Fire Shield", "shard", "new"],
  npc_dota_hero_undying: [85, "Undying", "undying_tombstone", "Tombstone", "shard", "existing"],
  npc_dota_hero_rubick: [86, "Rubick", "rubick_spell_steal", "Spell Steal", "scepter", "existing"],
  npc_dota_hero_disruptor: [87, "Disruptor", "disruptor_kinetic_fence", "Kinetic Fence", "shard", "new"],
  npc_dota_hero_nyx_assassin: [88, "Nyx Assassin", "nyx_assassin_burrow", "Burrow", "scepter", "new"],
  npc_dota_hero_naga_siren: [89, "Naga Siren", "naga_siren_ensnare", "Ensnare", "scepter", "existing"],
  npc_dota_hero_keeper_of_the_light: [
    90,
    "Keeper of the Light",
    "keeper_of_the_light_will_o_wisp",
    "Will-O-Wisp",
    "scepter",
    "new",
  ],
  npc_dota_hero_wisp: [91, "Io", "wisp_spirits", "Spirits", "scepter", "existing"],
  npc_dota_hero_visage: [92, "Visage", "visage_gravekeepers_cloak", "Gravekeeper's Cloak", "shard", "existing"],
  npc_dota_hero_slark: [93, "Slark", "slark_depth_shroud", "Depth Shroud", "shard", "new"],
  npc_dota_hero_medusa: [94, "Medusa", "medusa_cold_blooded", "Cold Blooded", "shard", "new"],
  npc_dota_hero_ringmaster: [131, "Ringmaster", "ringmaster_spotlight", "Spotlight", "shard", "new"],
  npc_dota_hero_muerta: [138, "Muerta", "muerta_dead_shot", "Dead Shot", "scepter", "existing"],
  npc_dota_hero_kez: [145, "Kez", "kez_shodo_sai", "Shodo Sai", "shard", "existing"],
  npc_dota_hero_largo: [155, "Largo", "largo_encore", "Encore", "shard", "existing"],
};

const source = JSON.parse(readFileSync(new URL("../src/data/aghanim-upgrades.json", import.meta.url)));
const questions = JSON.parse(readFileSync(new URL("../src/data/aghanim-questions.json", import.meta.url)));
const valveFixture = JSON.parse(readFileSync(new URL("./fixtures/aghanim-valve-7.41f.json", import.meta.url)));
const upgrade = (hero) => source.upgrades.find((record) => record.heroKey === "npc_dota_hero_" + hero);

const valveRoot = process.env.DOTA_VALVE_HERO_DATA_ROOT;
describe("Aghanim facts reviewed against Valve data", () => {
  it("keeps all 84 correct heroes, ability names, and upgrade types from the primary source", () => {
    expect(source.upgrades).toHaveLength(84);
    expect(questions).toHaveLength(84);
    for (const [heroKey, [heroId, heroName, abilityKey, abilityName, upgradeType, upgradeMode]] of Object.entries(
      valveFacts,
    )) {
      const record = source.upgrades.find((candidate) => candidate.heroKey === heroKey);
      expect(record, heroKey).toMatchObject({ clientAbilityKey: abilityKey, abilityName, upgradeType, upgradeMode });
      const id = "aghanim-upgrade:" + heroKey.replace("npc_dota_hero_", "") + ":" + upgradeType;
      const question = questions.find((candidate) => candidate.id === id);
      expect(question.answers[question.correctIndex], id).toBe(heroName);
      expect(question.aghanim, id).toMatchObject({ abilityName, upgradeType, upgradeMode });
      expect(question.source.url, id).toBe(
        "https://www.dota2.com/datafeed/herodata?language=english&hero_id=" + heroId,
      );
      expect(record.sourceSha256, id).toMatch(/^[a-f0-9]{64}$/);
    }
  });

  it("preserves the target, range, and duration conditions in the corrected effects", () => {
    expect(upgrade("axe").effect).toContain("attack damage against the caster");
    expect(upgrade("crystal_maiden").effect).toContain("disjointing incoming projectiles");
    expect(upgrade("morphling").effect).toMatch(/^Alt-cast/);
    expect(upgrade("shadow_shaman").effect).toContain("without disabling allied targets");
    expect(upgrade("enigma").effect).toContain("cannot multiply");
    expect(upgrade("enigma").effect).not.toContain("uncontrollable");
    expect(upgrade("leshrac").effect).toContain("the caster moves faster");
    expect(upgrade("weaver").effect).toContain("within 1200 range");
    expect(upgrade("batrider").effect).toContain("within 650 range");
    expect(upgrade("spirit_breaker").effect).toContain("from a chosen hero");
    expect(upgrade("obsidian_destroyer").effect).toContain("below 20%");
    expect(upgrade("chaos_knight").effect).toContain("copy of the caster");
    expect(upgrade("treant").effect).toContain("for six minutes");
    expect(upgrade("medusa").effect).toContain("targeted by an enemy spell");
    expect(upgrade("ringmaster").effect).toContain("damage illusions each second based on their maximum health");
    expect(upgrade("largo").effect).toContain("allied hero within cast range");
  });

  it("reveals the item and ability name only at their scheduled clue stages", () => {
    const round = {
      id: "aghanim-proofread",
      phase: "answering",
      game: "aghanim-lab",
      answerDeadline: 15000,
      answerDuration: 15000,
    };
    for (const question of questions) {
      const first = publicQuestionForRound(question, round, 1000);
      const second = publicQuestionForRound(question, round, 6000);
      const third = publicQuestionForRound(question, round, 11000);
      expect(first.aghanim, question.id).toEqual({ effect: question.aghanim.effect });
      expect(second.aghanim, question.id).toMatchObject({
        upgradeType: question.aghanim.upgradeType,
        upgradeMode: question.aghanim.upgradeMode,
      });
      expect(second.aghanim.abilityName, question.id).toBeUndefined();
      expect(third.aghanim.abilityName, question.id).toBe(question.aghanim.abilityName);
      expect(first.reveal, question.id).toBeNull();
      expect(third.reveal, question.id).toBeNull();
    }
  });

  it("matches the committed Valve source fields and their actual ability flags", () => {
    expect(valveFixture.patch).toBe(source.patch);
    expect(valveFixture.observedAt).toBe(source.reviewedAt);
    expect(valveFixture.provenance.latestPatch.rawResponseSha256).toBe(source.sourceSnapshot.patchListSha256);
    const heroes = valveFixture.heroes;
    expect(heroes).toHaveLength(127);
    expect(new Set(heroes.map((hero) => hero.name)).size).toBe(127);
    for (const hero of heroes) {
      expect(hero.source.url).toBe("https://www.dota2.com/datafeed/herodata?language=english&hero_id=" + hero.id);
      expect(hero.source.observedAt).toBe(valveFixture.observedAt);
      expect(hero.source.rawResponseSha256).toMatch(/^[a-f0-9]{64}$/);
      if (valveRoot) {
        const bytes = readFileSync(path.join(valveRoot, hero.id + ".json"));
        expect(bytes.length, hero.name).toBe(hero.source.rawResponseBytes);
        expect(createHash("sha256").update(bytes).digest("hex"), hero.name).toBe(hero.source.rawResponseSha256);
        const rawHero = JSON.parse(bytes).result.data.heroes.find((candidate) => candidate.id === hero.id);
        const fields = valveFixture.provenance.abilityFields;
        const flags = fields.filter((field) => field.startsWith("ability_"));
        const projectedAbilities = rawHero.abilities
          .filter((ability) => flags.some((flag) => ability[flag]))
          .map((ability) => Object.fromEntries(fields.map((field) => [field, ability[field]])));
        expect(hero, hero.name).toMatchObject({ id: rawHero.id, name: rawHero.name, name_loc: rawHero.name_loc });
        expect(hero.abilities, hero.name).toEqual(projectedAbilities);
      }
    }
    for (const [heroKey, [heroId, heroName, abilityKey, abilityName, upgradeType, upgradeMode]] of Object.entries(
      valveFacts,
    )) {
      const hero = heroes.find((candidate) => candidate.name === heroKey);
      const ability = hero.abilities.find((candidate) => candidate.name === abilityKey);
      const record = source.upgrades.find((candidate) => candidate.heroKey === heroKey);
      expect(hero.id).toBe(heroId);
      expect(hero.source.rawResponseSha256, heroKey).toBe(record.sourceSha256);
      expect(hero.source.url, heroKey).toBe(record.source.url);
      expect(hero.name_loc).toBe(heroName);
      expect(ability.name_loc).toBe(abilityName);
      const flag = "ability_" + (upgradeMode === "new" ? "is_granted_by_" : "has_") + upgradeType;
      expect(ability[flag], heroKey + ":" + flag).toBe(true);
      const matchingOwners = heroes
        .filter((candidate) => candidate.abilities.some((entry) => entry.name_loc === abilityName && entry[flag]))
        .map((candidate) => candidate.name);
      expect(matchingOwners, heroKey + ": final two clues").toEqual([heroKey]);
    }
  });
});
