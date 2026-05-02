import type {
  AppState,
  DailyEntry,
  ExerciseLog,
  GoalSettings,
  WorkoutLog,
} from './types';

const STORAGE_KEY = 'progress-app-state-v1';

export const todayKey = () => new Date().toISOString().slice(0, 10);

export const makeId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const createEmptyDailyEntry = (date: string): DailyEntry => ({
  date,
  wakeTime: '',
  breakfastEaten: false,
  preWorkoutMealEaten: false,
  postWorkoutMealEaten: false,
  workoutCompleted: false,
  bedtime: '',
  bodyweight: '',
  mealsEaten: '',
  energy: 3,
  focus: 3,
  notes: '',
  journal: '',
  customHabits: {},
});

export const createExercise = (): ExerciseLog => ({
  id: makeId(),
  name: '',
  sets: [{ weight: '', reps: '' }],
  notes: '',
});

const normalizeExercise = (exercise: Partial<ExerciseLog> | undefined): ExerciseLog => ({
  id: exercise?.id || makeId(),
  name: exercise?.name || '',
  sets:
    Array.isArray(exercise?.sets) && exercise!.sets.length > 0
      ? exercise!.sets.map((set) => ({
          weight: typeof set?.weight === 'string' ? set.weight : '',
          reps: typeof set?.reps === 'string' ? set.reps : '',
        }))
      : [{ weight: '', reps: '' }],
  notes: exercise?.notes || '',
});

export const createEmptyWorkout = (date: string): WorkoutLog => ({
  id: makeId(),
  date,
  workoutName: '',
  plannedWorkout: '',
  exercises: [createExercise()],
  notes: '',
  accountabilityNotes: '',
});

export const defaultSettings = (): GoalSettings => ({
  bodyweightGoal: '',
  mealsGoal: '3 meals',
  wakeTimeGoal: 'Wake up by 6:30 AM',
  bedtimeGoal: 'In bed by 10:30 PM',
  trainingGoal: '',
  journalPrompt: 'What mattered today? What helped or hurt momentum?',
  consistencyTarget: 5,
  customHabits: [{ id: makeId(), label: 'Stretching' }],
  scoreHabits: {
    breakfastEaten: true,
    preWorkoutMealEaten: true,
    postWorkoutMealEaten: true,
    workoutCompleted: true,
    wakeTime: true,
    bedtime: true,
    mealsEaten: false,
  },
});

const createEmptyState = (): AppState => ({
  dailyEntries: [],
  workouts: [],
  settings: defaultSettings(),
  workoutDrafts: {},
});

export const hydrateState = (parsed: Partial<AppState> | null | undefined): AppState => {
  const defaults = defaultSettings();

  const customHabits = Array.isArray(parsed?.settings?.customHabits)
    ? parsed!.settings!.customHabits
        .map((habit) =>
          habit && typeof habit.label === 'string'
            ? { id: habit.id || makeId(), label: habit.label }
            : null,
        )
        .filter((habit): habit is { id: string; label: string } => Boolean(habit))
    : defaults.customHabits;

  const normalizeEntry = (entry: Partial<DailyEntry> | undefined): DailyEntry => ({
    ...createEmptyDailyEntry(
      typeof entry?.date === 'string' && entry.date ? entry.date : todayKey(),
    ),
    ...entry,
    mealsEaten:
      typeof entry?.mealsEaten === 'string'
        ? entry.mealsEaten
        : entry?.breakfastEaten || entry?.preWorkoutMealEaten || entry?.postWorkoutMealEaten
          ? '1'
          : '',
    journal: typeof entry?.journal === 'string' ? entry.journal : '',
    notes: typeof entry?.notes === 'string' ? entry.notes : '',
    customHabits:
      entry?.customHabits && typeof entry.customHabits === 'object'
        ? entry.customHabits
        : {},
  });

  const normalizeWorkout = (workout: Partial<WorkoutLog> | undefined): WorkoutLog => ({
    ...createEmptyWorkout(
      typeof workout?.date === 'string' && workout.date ? workout.date : todayKey(),
    ),
    ...workout,
    id: typeof workout?.id === 'string' && workout.id ? workout.id : makeId(),
    date: typeof workout?.date === 'string' && workout.date ? workout.date : todayKey(),
    workoutName: typeof workout?.workoutName === 'string' ? workout.workoutName : '',
    plannedWorkout:
      typeof workout?.plannedWorkout === 'string' ? workout.plannedWorkout : '',
    notes: typeof workout?.notes === 'string' ? workout.notes : '',
    accountabilityNotes:
      typeof workout?.accountabilityNotes === 'string' ? workout.accountabilityNotes : '',
    exercises: Array.isArray(workout?.exercises)
      ? workout!.exercises.map((exercise) => normalizeExercise(exercise))
      : [createExercise()],
  });

  return {
    dailyEntries: Array.isArray(parsed?.dailyEntries)
      ? parsed!.dailyEntries.map((entry) => normalizeEntry(entry))
      : [],
    workouts: Array.isArray(parsed?.workouts)
      ? parsed!.workouts.map((workout) => normalizeWorkout(workout))
      : [],
    settings: {
      ...defaults,
      ...(parsed?.settings ?? {}),
      customHabits,
      scoreHabits: {
        ...defaults.scoreHabits,
        ...(parsed?.settings?.scoreHabits ?? {}),
      },
    },
    workoutDrafts:
      parsed?.workoutDrafts && typeof parsed.workoutDrafts === 'object'
        ? Object.fromEntries(
            Object.entries(parsed.workoutDrafts).map(([date, workout]) => [
              date,
              normalizeWorkout(workout),
            ]),
          )
        : {},
  };
};

export const loadState = (): AppState => {
  const raw = localStorage.getItem(STORAGE_KEY);

  if (!raw) {
    return createEmptyState();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AppState>;
    return hydrateState(parsed);
  } catch {
    return createEmptyState();
  }
};

export const saveState = (state: AppState) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
};

export const upsertDailyEntry = (
  entries: DailyEntry[],
  nextEntry: DailyEntry,
) => {
  const remaining = entries.filter((entry) => entry.date !== nextEntry.date);
  return [...remaining, nextEntry].sort((a, b) => b.date.localeCompare(a.date));
};

export const upsertWorkout = (workouts: WorkoutLog[], nextWorkout: WorkoutLog) => {
  const remaining = workouts.filter((workout) => workout.id !== nextWorkout.id);
  return [...remaining, nextWorkout].sort((a, b) => {
    const byDate = b.date.localeCompare(a.date);
    if (byDate !== 0) {
      return byDate;
    }
    return b.id.localeCompare(a.id);
  });
};

export const getEntryForDate = (entries: DailyEntry[], date: string) =>
  entries.find((entry) => entry.date === date) ?? createEmptyDailyEntry(date);

export const normalizeEntryForSettings = (
  entry: DailyEntry,
  settings: GoalSettings,
): DailyEntry => {
  const customHabits = settings.customHabits.reduce<Record<string, boolean>>(
    (accumulator, habit) => {
      accumulator[habit.id] = entry.customHabits?.[habit.id] ?? false;
      return accumulator;
    },
    {},
  );

  return {
    ...entry,
    customHabits,
  };
};

export const formatDisplayDate = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(new Date(`${date}T00:00:00`));

export const getRecentDates = (days: number) => {
  const dates: string[] = [];
  const base = new Date();

  for (let index = 0; index < days; index += 1) {
    const next = new Date(base);
    next.setDate(base.getDate() - index);
    dates.push(next.toISOString().slice(0, 10));
  }

  return dates.reverse();
};

type TrendPoint = {
  label: string;
  value: number;
};

const formatMonthLabel = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'short',
  }).format(new Date(`${date}T00:00:00`));

const formatShortDateLabel = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    month: 'numeric',
    day: 'numeric',
  }).format(new Date(`${date}T00:00:00`));

const groupDatesIntoWeeks = (dates: string[]) => {
  const weeks: string[][] = [];

  for (let index = 0; index < dates.length; index += 7) {
    weeks.push(dates.slice(index, index + 7));
  }

  return weeks;
};

const groupDatesIntoMonths = (dates: string[]) => {
  const months = new Map<string, string[]>();

  for (const date of dates) {
    const key = date.slice(0, 7);
    const existing = months.get(key) ?? [];
    existing.push(date);
    months.set(key, existing);
  }

  return Array.from(months.values());
};

export const getWeeklyCompletion = (
  entries: DailyEntry[],
  settings: GoalSettings,
  days = 28,
) => {
  const recent = getRecentDates(days);
  const groups = days >= 180 ? groupDatesIntoMonths(recent) : groupDatesIntoWeeks(recent);
  const points: TrendPoint[] = [];

  for (const chunk of groups) {
    const chunkEntries = chunk.map((date) =>
      normalizeEntryForSettings(getEntryForDate(entries, date), settings),
    );
    const maxPoints = chunkEntries.length * getHabitScore(createEmptyDailyEntry(todayKey()), settings).total;
    const earned = chunkEntries.reduce(
      (sum, entry) => sum + getHabitScore(entry, settings).completed,
      0,
    );

    points.push({
      label: days >= 180 ? formatMonthLabel(chunk[0]) : formatShortDateLabel(chunk[chunk.length - 1]),
      value: maxPoints === 0 ? 0 : Math.round((earned / maxPoints) * 100),
    });
  }

  return points;
};

export const getWorkoutsPerWeek = (workouts: WorkoutLog[], days = 28) => {
  const recent = getRecentDates(days);
  const groups = days >= 180 ? groupDatesIntoMonths(recent) : groupDatesIntoWeeks(recent);
  return groups.map((chunk) => {
    const count = workouts.filter((workout) => chunk.includes(workout.date)).length;
    return {
      label: days >= 180 ? formatMonthLabel(chunk[0]) : formatShortDateLabel(chunk[chunk.length - 1]),
      value: count,
    };
  });
};

export const getBodyweightTrend = (entries: DailyEntry[], days = 14) => {
  const recent = getRecentDates(days);

  if (days >= 180) {
    return groupDatesIntoMonths(recent).map((chunk) => {
      const weights = chunk
        .map((date) => Number(getEntryForDate(entries, date).bodyweight) || 0)
        .filter((value) => value > 0);

      const average =
        weights.length > 0
          ? Number((weights.reduce((sum, value) => sum + value, 0) / weights.length).toFixed(1))
          : 0;

      return {
        label: formatMonthLabel(chunk[0]),
        value: average,
      };
    });
  }

  return recent.map((date) => {
    const entry = getEntryForDate(entries, date);
    return {
      label: date.slice(5),
      value: Number(entry.bodyweight) || 0,
    };
  });
};

const parseGoalTime = (value: string) => {
  const match = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (!match) {
    return null;
  }

  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  const meridiem = match[3]?.toUpperCase();

  if (meridiem === 'PM' && hours < 12) {
    hours += 12;
  }
  if (meridiem === 'AM' && hours === 12) {
    hours = 0;
  }

  return hours * 60 + minutes;
};

const parseLoggedTime = (value: string) => {
  const match = value.match(/^(\d{2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  return Number(match[1]) * 60 + Number(match[2]);
};

export const meetsWakeGoal = (loggedTime: string, goal: string) => {
  const logged = parseLoggedTime(loggedTime);
  const target = parseGoalTime(goal);

  if (logged === null || target === null) {
    return Boolean(loggedTime);
  }

  return logged <= target;
};

export const meetsBedtimeGoal = (loggedTime: string, goal: string) => {
  const logged = parseLoggedTime(loggedTime);
  const target = parseGoalTime(goal);

  if (logged === null || target === null) {
    return Boolean(loggedTime);
  }

  const normalizedLogged = logged < 12 * 60 ? logged + 24 * 60 : logged;
  const normalizedTarget = target < 12 * 60 ? target + 24 * 60 : target;

  return normalizedLogged <= normalizedTarget;
};

export const getSleepTimingTrend = (entries: DailyEntry[], days = 14) => {
  const recent = getRecentDates(days);

  if (days >= 180) {
    return groupDatesIntoMonths(recent).map((chunk) => {
      const wakeValues = chunk
        .map((date) => parseLoggedTime(getEntryForDate(entries, date).wakeTime))
        .filter((value): value is number => value !== null);
      const bedValues = chunk
        .map((date) => parseLoggedTime(getEntryForDate(entries, date).bedtime))
        .filter((value): value is number => value !== null)
        .map((value) => (value < 12 * 60 ? value + 24 * 60 : value));

      const avgWake =
        wakeValues.length > 0
          ? Math.round(wakeValues.reduce((sum, value) => sum + value, 0) / wakeValues.length)
          : null;
      const avgBed =
        bedValues.length > 0
          ? Math.round(bedValues.reduce((sum, value) => sum + value, 0) / bedValues.length)
          : null;

      return {
        label: formatMonthLabel(chunk[0]),
        wakeValue: avgWake,
        bedValue: avgBed,
      };
    });
  }

  return recent.map((date) => {
    const entry = getEntryForDate(entries, date);
    const wake = parseLoggedTime(entry.wakeTime);
    const bed = parseLoggedTime(entry.bedtime);

    return {
      label: date.slice(5),
      wakeValue: wake,
      bedValue: bed === null ? null : bed < 12 * 60 ? bed + 24 * 60 : bed,
    };
  });
};

export const getHabitScore = (entry: DailyEntry, settings: GoalSettings) => {
  const checks = [
    settings.scoreHabits.breakfastEaten ? entry.breakfastEaten : null,
    settings.scoreHabits.preWorkoutMealEaten ? entry.preWorkoutMealEaten : null,
    settings.scoreHabits.postWorkoutMealEaten ? entry.postWorkoutMealEaten : null,
    settings.scoreHabits.workoutCompleted ? entry.workoutCompleted : null,
    settings.scoreHabits.wakeTime ? meetsWakeGoal(entry.wakeTime, settings.wakeTimeGoal) : null,
    settings.scoreHabits.bedtime ? meetsBedtimeGoal(entry.bedtime, settings.bedtimeGoal) : null,
    settings.scoreHabits.mealsEaten ? Number(entry.mealsEaten) > 0 : null,
    ...settings.customHabits.map((habit) => entry.customHabits?.[habit.id] ?? false),
  ].filter((item) => item !== null);
  const completed = checks.filter(Boolean).length;
  return { completed, total: checks.length };
};

export const getCurrentStreak = (entries: DailyEntry[], settings: GoalSettings) => {
  let streak = 0;

  for (const date of [...getRecentDates(30)].reverse()) {
    const score = getHabitScore(
      normalizeEntryForSettings(getEntryForDate(entries, date), settings),
      settings,
    );
    if (score.completed >= settings.consistencyTarget) {
      streak += 1;
    } else if (streak > 0) {
      break;
    }
  }

  return streak;
};

export const buildDailyMarkdown = (entry: DailyEntry, settings: GoalSettings) => {
  const score = getHabitScore(entry, settings);
  const customHabitLines = settings.customHabits.map(
    (habit) => `- ${habit.label}: ${entry.customHabits?.[habit.id] ? 'Yes' : 'No'}`,
  );

  return [
    `## ${entry.date} Daily Check-In`,
    '',
    `- Wake time: ${entry.wakeTime || 'Not logged'}`,
    `- Breakfast: ${entry.breakfastEaten ? 'Yes' : 'No'}`,
    `- Pre-workout meal: ${entry.preWorkoutMealEaten ? 'Yes' : 'No'}`,
    `- Post-workout meal: ${entry.postWorkoutMealEaten ? 'Yes' : 'No'}`,
    `- Workout completed: ${entry.workoutCompleted ? 'Yes' : 'No'}`,
    `- Bedtime: ${entry.bedtime || 'Not logged'}`,
    `- Bodyweight: ${entry.bodyweight || 'Not logged'}`,
    `- Meals eaten: ${entry.mealsEaten || 'Not logged'}`,
    `- Energy: ${entry.energy}/5`,
    `- Focus: ${entry.focus}/5`,
    ...customHabitLines,
    `- Consistency score: ${score.completed}/${score.total}`,
    '',
    '### Journal',
    entry.journal || '-',
    '',
    '### Notes',
    entry.notes || '-',
  ].join('\n');
};

export const buildWorkoutMarkdown = (workout: WorkoutLog) => {
  const exerciseLines = workout.exercises.flatMap((exercise) => {
    const header = `### ${exercise.name || 'Exercise'}`;
    const setLines = exercise.sets.map(
      (set, index) => `- Set ${index + 1}: ${set.weight || '-'} x ${set.reps || '-'}`,
    );
    const noteLine = exercise.notes ? [`- Exercise notes: ${exercise.notes}`] : [];
    return [header, ...setLines, ...noteLine, ''];
  });

  return [
    `## ${workout.date} ${workout.workoutName || 'Workout Log'}`,
    '',
    '### Planned Workout',
    workout.plannedWorkout || '-',
    '',
    ...exerciseLines,
    '### Workout Notes',
    workout.notes || '-',
    '',
    '### Accountability Notes',
    workout.accountabilityNotes || '-',
  ].join('\n');
};

export const buildDayPacketMarkdown = (
  entry: DailyEntry,
  workouts: WorkoutLog[],
  settings: GoalSettings,
) => {
  const daily = buildDailyMarkdown(entry, settings);
  const dailyWorkouts = workouts.filter((workout) => workout.date === entry.date);

  if (dailyWorkouts.length === 0) {
    return daily;
  }

  return [
    daily,
    '',
    '---',
    '',
    ...dailyWorkouts.map((workout) => buildWorkoutMarkdown(workout)),
  ].join('\n');
};

export const copyText = async (text: string) => {
  await navigator.clipboard.writeText(text);
};

export const shareText = async (title: string, text: string) => {
  if (navigator.share) {
    await navigator.share({ title, text });
    return true;
  }

  return false;
};

export const downloadBackup = (state: AppState) => {
  const blob = new Blob([JSON.stringify(state, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `progress-app-backup-${todayKey()}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const readBackupFile = async (file: File) => {
  const text = await file.text();
  const parsed = JSON.parse(text) as Partial<AppState>;
  return hydrateState(parsed);
};
