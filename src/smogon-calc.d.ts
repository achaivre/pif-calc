/**
 * Permissive type declarations for @smogon/calc.
 * Uses loose types (string instead of string-literal unions) so we can pass
 * custom PIF data (fusions, non-standard types, etc.) without casting.
 */
declare module '@smogon/calc' {
  export type GenerationNum = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  export type Weather = 'Sand' | 'Sun' | 'Rain' | 'Hail' | 'Snow' | 'Harsh Sunshine' | 'Heavy Rain' | 'Strong Winds';
  export type Terrain = 'Electric' | 'Grassy' | 'Psychic' | 'Misty';

  export interface Generation {
    num: GenerationNum;
  }

  export const Generations: {
    get(gen: GenerationNum): Generation;
  };

  export type StatKey = 'hp' | 'atk' | 'def' | 'spa' | 'spd' | 'spe';
  export type StatsTable = Record<StatKey, number>;

  export class Pokemon {
    constructor(
      gen: Generation,
      name: string,
      options?: {
        level?: number;
        nature?: string;
        ability?: string;
        item?: string;
        ivs?: Partial<StatsTable>;
        evs?: Partial<StatsTable>;
        boosts?: Partial<StatsTable>;
        overrides?: {
          baseStats?: StatsTable;
          types?: string[];
          weightkg?: number;
        };
      }
    );
    maxHP(original?: boolean): number;
    curHP(original?: boolean): number;
  }

  export class Move {
    constructor(
      gen: Generation,
      name: string,
      options?: {
        isCrit?: boolean;
        hits?: number;
        timesUsed?: number;
        overrides?: {
          basePower?: number;
          type?: string;
          category?: 'Physical' | 'Special' | 'Status';
        };
      }
    );
  }

  export class Side {
    constructor(options?: {
      spikes?: number;
      isSR?: boolean;
      isReflect?: boolean;
      isLightScreen?: boolean;
      isAuroraVeil?: boolean;
      isTailwind?: boolean;
      isHelpingHand?: boolean;
      isFriendGuard?: boolean;
    });
  }

  export class Field {
    constructor(options?: {
      weather?: Weather;
      terrain?: Terrain;
      isGravity?: boolean;
      isMagicRoom?: boolean;
      isWonderRoom?: boolean;
      attackerSide?: Side;
      defenderSide?: Side;
    });
  }

  export class Result {
    damage: number | number[] | [number[], number[]];
    desc(): string;
    range(): [number, number];
    kochance(err?: boolean): { text: string; n: number; chance?: number };
    fullDesc(notation?: string): string;
  }

  export function calculate(
    gen: Generation,
    attacker: Pokemon,
    defender: Pokemon,
    move: Move,
    field?: Field
  ): Result;
}
