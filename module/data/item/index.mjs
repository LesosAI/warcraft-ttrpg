/**
 * Item DataModels, keyed by subtype. The key is the `type` in system.json's
 * `documentTypes.Item` and the suffix of the `TYPES.Item.*` localization key,
 * so this object is the single place the three have to agree.
 */

import {
  CareerData,
  ClassData,
  FeatureData,
  LegacyData,
  ProfessionData,
  RaceData,
  TalentData,
  TalentTreeData
} from "./progression.mjs";
import { ArmorData, GearData, TraitData, WeaponData } from "./equipment.mjs";
import { SpellData } from "./spell.mjs";

export const ITEM_DATA_MODELS = {
  race: RaceData,
  class: ClassData,
  career: CareerData,
  talent: TalentData,
  talentTree: TalentTreeData,
  feature: FeatureData,
  legacy: LegacyData,
  profession: ProfessionData,
  spell: SpellData,
  weapon: WeaponData,
  armor: ArmorData,
  gear: GearData,
  trait: TraitData
};

export {
  ArmorData,
  CareerData,
  ClassData,
  FeatureData,
  GearData,
  LegacyData,
  ProfessionData,
  RaceData,
  SpellData,
  TalentData,
  TalentTreeData,
  TraitData,
  WeaponData
};
