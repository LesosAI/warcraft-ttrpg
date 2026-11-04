/** Lays the scarabFever carrier (D12, Phase 5b): no duration, carried until cured.
 *  A thin door over `creature-diseases.mjs`, which owns the write. */
import { layCreatureDisease } from "./creature-diseases.mjs";

export const layPlagueCloud = ({ victim, by, valid } = {}) => layCreatureDisease({ key: "scarabFever", victim, by, valid });
