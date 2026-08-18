export type MimicTier = 0 | 1 | 2 | 3 | 4;

export interface ChapterDef {
  index: number;
  id: string;
  titleKey: string;
  /** Which level the chapter starts in. */
  level: 'lobby' | 'floor0';
  /** Mimic behaviour tier while this chapter runs (0 = no mimic). */
  mimicTier: MimicTier;
  /** Minimum seconds of quiet between anomalies. */
  anomalyGap: number;
  /** Upper bound on anomalies triggered during one visit of this chapter. */
  anomalyBudget: number;
  startObjective: string;
  checkpointId: string;
}

export const CHAPTERS: ChapterDef[] = [
  {
    index: 0,
    id: 'prologue',
    titleKey: 'chapter.0',
    level: 'lobby',
    mimicTier: 0,
    anomalyGap: 999,
    anomalyBudget: 0,
    startObjective: 'p_enter',
    checkpointId: 'prologue',
  },
  {
    index: 1,
    id: 'empty_corridor',
    titleKey: 'chapter.1',
    level: 'floor0',
    mimicTier: 0,
    anomalyGap: 22,
    anomalyBudget: 5,
    startObjective: 'c1_look',
    checkpointId: 'c1_start',
  },
  {
    index: 2,
    id: 'first_mimic',
    titleKey: 'chapter.2',
    level: 'floor0',
    mimicTier: 1,
    anomalyGap: 18,
    anomalyBudget: 6,
    startObjective: 'c2_switch',
    checkpointId: 'c2_start',
  },
  {
    index: 3,
    id: 'clock_apartment',
    titleKey: 'chapter.3',
    level: 'floor0',
    mimicTier: 2,
    anomalyGap: 16,
    anomalyBudget: 7,
    startObjective: 'c3_apartment',
    checkpointId: 'c3_start',
  },
  {
    index: 4,
    id: 'kids_room',
    titleKey: 'chapter.4',
    level: 'floor0',
    mimicTier: 3,
    anomalyGap: 14,
    anomalyBudget: 8,
    startObjective: 'c4_kids',
    checkpointId: 'c4_start',
  },
  {
    index: 5,
    id: 'control_room',
    titleKey: 'chapter.5',
    level: 'floor0',
    mimicTier: 4,
    anomalyGap: 12,
    anomalyBudget: 9,
    startObjective: 'c5_door',
    checkpointId: 'c5_start',
  },
];

export const LAST_CHAPTER = CHAPTERS.length - 1;

export function chapterDef(index: number): ChapterDef {
  return CHAPTERS[Math.max(0, Math.min(LAST_CHAPTER, index))];
}
