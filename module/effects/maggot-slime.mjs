/** Lays the carrionPalsy carrier (D12, Phase 5b): no duration, carried until cured.
 *  A thin door over `creature-diseases.mjs`, which owns the write. */
import { layCreatureDisease } from "./creature-diseases.mjs";

export const layMaggotSlime = ({ victim, by, valid } = {}) => layCreatureDisease({ key: "carrionPalsy", victim, by, valid });
