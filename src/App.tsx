import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import {
  buildDayPacketMarkdown,
  buildDailyMarkdown,
  buildWorkoutMarkdown,
  copyText,
  createEmptyWorkout,
  createExercise,
  defaultSettings,
  downloadBackup,
  formatDisplayDate,
  getBodyweightTrend,
  getCurrentStreak,
  getEntryForDate,
  getHabitScore,
  getRecentDates,
  getSleepTimingTrend,
  getWeeklyCompletion,
  getWorkoutsPerWeek,
  loadState,
  makeId,
  meetsBedtimeGoal,
  meetsWakeGoal,
  normalizeEntryForSettings,
  readBackupFile,
  saveState,
  shareText,
  todayKey,
  upsertDailyEntry,
  upsertWorkout,
} from './lib';
import type { DailyEntry, ExerciseLog, GoalSettings, WorkoutLog } from './types';

type Tab = 'dashboard' | 'today' | 'journal' | 'workouts' | 'history' | 'settings';

type DeferredInstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type PhoneNavigator = Navigator & {
  standalone?: boolean;
};

type LegacyMediaQueryList = MediaQueryList & {
  addListener?: (listener: (event: MediaQueryListEvent) => void) => void;
  removeListener?: (listener: (event: MediaQueryListEvent) => void) => void;
};

type DashboardRange = 14 | 30 | 90 | 180;

const tabs: { id: Tab; label: string; icon: string }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'today',     label: 'Today',     icon: '✅' },
  { id: 'journal',   label: 'Journal',   icon: '📝' },
  { id: 'workouts',  label: 'Workouts',  icon: '🏋️' },
  { id: 'history',   label: 'History',   icon: '📅' },
];

const goalFieldLabels: {
  key: keyof Pick<
    GoalSettings,
    'bodyweightGoal' | 'mealsGoal' | 'wakeTimeGoal' | 'bedtimeGoal' | 'trainingGoal'
  >;
  label: string;
  placeholder: string;
}[] = [
  {
    key: 'bodyweightGoal',
    label: 'Bodyweight goal',
    placeholder: 'Reach 182 by June 15',
  },
  {
    key: 'mealsGoal',
    label: 'Meals goal',
    placeholder: 'Eat 3 meals daily',
  },
  {
    key: 'wakeTimeGoal',
    label: 'Wake goal',
    placeholder: 'Wake up by 6:30 AM',
  },
  {
    key: 'bedtimeGoal',
    label: 'Bedtime goal',
    placeholder: 'In bed by 10:30 PM',
  },
  {
    key: 'trainingGoal',
    label: 'Training goal',
    placeholder: 'Train 4x per week',
  },
];

const dashboardRanges: { value: DashboardRange; label: string }[] = [
  { value: 14, label: '14d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
  { value: 180, label: '180d' },
];

const extractGoalNumber = (goal: string, fallback: string) => {
  const match = goal.match(/(\d+(?:\.\d+)?)/);
  return match?.[1] ?? fallback;
};

function App() {
  const [tab, setTab] = useState<Tab>('today');
  const [dailyEntries, setDailyEntries] = useState<DailyEntry[]>([]);
  const [workouts, setWorkouts] = useState<WorkoutLog[]>([]);
  const [settings, setSettings] = useState<GoalSettings>(defaultSettings());
  const [workoutDrafts, setWorkoutDrafts] = useState<Record<string, WorkoutLog>>({});
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [dashboardRange, setDashboardRange] = useState<DashboardRange>(30);
  const [workoutDraft, setWorkoutDraft] = useState<WorkoutLog>(() =>
    createEmptyWorkout(todayKey()),
  );
  const [copiedMessage, setCopiedMessage] = useState('');
  const [restoreMessage, setRestoreMessage] = useState('');
  const [installPrompt, setInstallPrompt] = useState<DeferredInstallPrompt | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const state = loadState();
    setDailyEntries(state.dailyEntries);
    setWorkouts(state.workouts);
    setSettings(state.settings);
    setWorkoutDrafts(state.workoutDrafts);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(display-mode: standalone)') as LegacyMediaQueryList;
    const updateStandalone = () =>
      setIsStandalone(
        mediaQuery.matches || (window.navigator as PhoneNavigator).standalone === true,
      );

    updateStandalone();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateStandalone);
    } else {
      mediaQuery.addListener?.(updateStandalone);
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as DeferredInstallPrompt);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', updateStandalone);
      } else {
        mediaQuery.removeListener?.(updateStandalone);
      }
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  useEffect(() => {
    saveState({ dailyEntries, workouts, settings, workoutDrafts });
  }, [dailyEntries, workouts, settings, workoutDrafts]);

  useEffect(() => {
    setWorkoutDraft(workoutDrafts[selectedDate] ?? createEmptyWorkout(selectedDate));
  }, [selectedDate, workoutDrafts]);

  useEffect(() => {
    if (!copiedMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setCopiedMessage(''), 1800);
    return () => window.clearTimeout(timeout);
  }, [copiedMessage]);

  useEffect(() => {
    if (!restoreMessage) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setRestoreMessage(''), 2600);
    return () => window.clearTimeout(timeout);
  }, [restoreMessage]);

  const todayEntry = useMemo(
    () => normalizeEntryForSettings(getEntryForDate(dailyEntries, selectedDate), settings),
    [dailyEntries, selectedDate, settings],
  );

  const weeklyCompletion = useMemo(
    () => getWeeklyCompletion(dailyEntries, settings, dashboardRange),
    [dailyEntries, settings, dashboardRange],
  );
  const workoutsPerWeek = useMemo(
    () => getWorkoutsPerWeek(workouts, dashboardRange),
    [workouts, dashboardRange],
  );
  const bodyweightTrend = useMemo(
    () => getBodyweightTrend(dailyEntries, dashboardRange),
    [dailyEntries, dashboardRange],
  );
  const sleepTimingTrend = useMemo(
    () => getSleepTimingTrend(dailyEntries, dashboardRange),
    [dailyEntries, dashboardRange],
  );
  const streak = useMemo(
    () => getCurrentStreak(dailyEntries, settings),
    [dailyEntries, settings],
  );
  const recentHistory = useMemo(
    () =>
      [...getRecentDates(10)].reverse().map((date) => ({
        date,
        entry: normalizeEntryForSettings(getEntryForDate(dailyEntries, date), settings),
      })),
    [dailyEntries, settings],
  );
  const currentWeekCompletion =
    weeklyCompletion.length > 0 ? weeklyCompletion[weeklyCompletion.length - 1].value : 0;
  const currentWeekWorkouts =
    workoutsPerWeek.length > 0 ? workoutsPerWeek[workoutsPerWeek.length - 1].value : 0;
  const isMonthlyRange = dashboardRange >= 180;
  const bodyweightPlaceholder = settings.bodyweightGoal
    ? extractGoalNumber(settings.bodyweightGoal, '185.4')
    : '185.4';
  const mealsPlaceholder = settings.mealsGoal
    ? extractGoalNumber(settings.mealsGoal, '3')
    : '3';

  const handleDailyChange = <K extends keyof DailyEntry>(
    key: K,
    value: DailyEntry[K],
  ) => {
    setDailyEntries((current) =>
      upsertDailyEntry(current, {
        ...todayEntry,
        [key]: value,
      }),
    );
  };

  const updateWorkoutDraft = (updater: (current: WorkoutLog) => WorkoutLog) => {
    setWorkoutDraft((current) => {
      const next = updater(current);
      setWorkoutDrafts((existing) => ({
        ...existing,
        [next.date]: next,
      }));
      return next;
    });
  };

  const handleExerciseChange = (
    exerciseIndex: number,
    nextExercise: ExerciseLog,
  ) => {
    updateWorkoutDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise, index) =>
        index === exerciseIndex ? nextExercise : exercise,
      ),
    }));
  };

  const saveWorkout = () => {
    if (!workoutDraft.workoutName.trim()) {
      return;
    }

    setWorkouts((current) => upsertWorkout(current, workoutDraft));
    setDailyEntries((current) =>
      upsertDailyEntry(current, {
        ...normalizeEntryForSettings(getEntryForDate(current, workoutDraft.date), settings),
        workoutCompleted: true,
      }),
    );
    setWorkoutDrafts((current) => {
      const next = { ...current };
      delete next[workoutDraft.date];
      return next;
    });
    setCopiedMessage('Workout saved');
    setWorkoutDraft(createEmptyWorkout(selectedDate));
  };

  const copyDaily = async () => {
    await copyText(buildDailyMarkdown(todayEntry, settings));
    setCopiedMessage('Daily markdown copied');
  };

  const copyDayPacket = async (date: string) => {
    const entry = normalizeEntryForSettings(getEntryForDate(dailyEntries, date), settings);
    await copyText(buildDayPacketMarkdown(entry, workouts, settings));
    setCopiedMessage('Day export copied');
  };

  const shareDayPacket = async (date: string) => {
    const entry = normalizeEntryForSettings(getEntryForDate(dailyEntries, date), settings);
    const didShare = await shareText(
      `${date} Progress App export`,
      buildDayPacketMarkdown(entry, workouts, settings),
    );

    if (didShare) {
      setCopiedMessage('Day export shared');
    } else {
      await copyDayPacket(date);
    }
  };

  const copyWorkout = async (workout: WorkoutLog) => {
    await copyText(buildWorkoutMarkdown(workout));
    setCopiedMessage('Workout markdown copied');
  };

  const triggerInstall = async () => {
    if (!installPrompt) {
      return;
    }

    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  const importBackup = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const restored = await readBackupFile(file);
      setDailyEntries(restored.dailyEntries);
      setWorkouts(restored.workouts);
      setSettings(restored.settings);
      setWorkoutDrafts(restored.workoutDrafts);
      setRestoreMessage('Backup restored');
    } catch {
      setRestoreMessage('Backup import failed');
    } finally {
      event.target.value = '';
    }
  };

  const checklistItems = [
    {
      id: 'breakfastEaten',
      label: 'Eat breakfast',
      checked: todayEntry.breakfastEaten,
      onChange: (checked: boolean) => handleDailyChange('breakfastEaten', checked),
    },
    {
      id: 'preWorkoutMealEaten',
      label: 'Eat pre-workout meal',
      checked: todayEntry.preWorkoutMealEaten,
      onChange: (checked: boolean) => handleDailyChange('preWorkoutMealEaten', checked),
    },
    {
      id: 'postWorkoutMealEaten',
      label: 'Eat post-workout meal',
      checked: todayEntry.postWorkoutMealEaten,
      onChange: (checked: boolean) => handleDailyChange('postWorkoutMealEaten', checked),
    },
    {
      id: 'workoutCompleted',
      label: 'Complete workout',
      checked: todayEntry.workoutCompleted,
      onChange: (checked: boolean) => handleDailyChange('workoutCompleted', checked),
    },
    ...settings.customHabits.map((habit) => ({
      id: habit.id,
      label: habit.label || 'Custom habit',
      checked: todayEntry.customHabits[habit.id] ?? false,
      onChange: (checked: boolean) =>
        handleDailyChange('customHabits', {
          ...todayEntry.customHabits,
          [habit.id]: checked,
        }),
    })),
  ].sort((left, right) => Number(left.checked) - Number(right.checked));

  return (
    <div className="app-shell">
      <aside className="sidebar">
       

        <nav className="nav">
          {tabs.map((item) => (
            <button
              key={item.id}
              className={item.id === tab ? 'nav-button active' : 'nav-button'}
              onClick={() => setTab(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="pulse-card">
          <span>Current streak</span>
          <strong>{streak} days</strong>
              <p>
            Counts days where you hit at least {settings.consistencyTarget} of your
            active basics.
          </p>
        </div>

        <div className="sidebar-footer">
          <button
            className={tab === 'settings' ? 'settings-link active' : 'settings-link'}
            onClick={() => setTab('settings')}
            type="button"
            aria-label="Open settings"
            title="Settings"
          >
            <span className="settings-icon">⚙</span>
            <span>Settings</span>
          </button>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="date-picker">
            <label htmlFor="date">Active date</label>
            <input
              id="date"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </div>
        </header>

        {copiedMessage ? <div className="toast">{copiedMessage}</div> : null}
        {restoreMessage ? <div className="toast">{restoreMessage}</div> : null}

        {tab === 'dashboard' ? (
          <section className="panel-grid">
            <div className="dashboard-controls">
              <RangeToggle
                value={dashboardRange}
                options={dashboardRanges}
                onChange={(next) => setDashboardRange(next as DashboardRange)}
              />
            </div>
            <MetricCard
              label="Today score"
              value={`${getHabitScore(todayEntry, settings).completed}/${getHabitScore(todayEntry, settings).total}`}
              detail="Core basics completed"
            />
            <MetricCard
              label="This week"
              value={`${currentWeekCompletion}%`}
              detail="Habit completion rate"
            />
            <MetricCard
              label="Recent workouts"
              value={`${currentWeekWorkouts}`}
              detail="Logged in the current week"
            />
            <MetricCard
              label="Bodyweight"
              value={todayEntry.bodyweight || '-'}
              detail="Latest logged weight"
            />

            <Panel
              title="Weekly consistency"
              subtitle={
                isMonthlyRange
                  ? `Completion percentage across the last ${dashboardRange} days, grouped by month`
                  : `Completion percentage across the last ${dashboardRange} days`
              }
            >
              <MiniBarChart data={weeklyCompletion} suffix="%" />
            </Panel>

            <Panel
              title="Workouts per week"
              subtitle={
                isMonthlyRange
                  ? `Sessions completed across the last ${dashboardRange} days, grouped by month`
                  : `Sessions completed across the last ${dashboardRange} days`
              }
            >
              <MiniBarChart data={workoutsPerWeek} />
            </Panel>

            <Panel
              title="Bodyweight trend"
              subtitle={
                isMonthlyRange
                  ? `Monthly average bodyweight across the last ${dashboardRange} days`
                  : `Last ${dashboardRange} days, only plotted when weight is logged`
              }
            >
              <MiniLineChart data={bodyweightTrend} />
            </Panel>

            <Panel
              title="Sleep timing"
              subtitle={
                isMonthlyRange
                  ? `Average wake time and bedtime by month across the last ${dashboardRange} days`
                  : `Wake time and bedtime overlay for the last ${dashboardRange} days`
              }
            >
              <SleepTimingChart data={sleepTimingTrend} />
            </Panel>

            <Panel
              title="Goal setup"
              subtitle="The things you track are editable here, not hardcoded"
            >
              <div className="form-grid">
                {goalFieldLabels.map((field) => (
                  <label key={field.key}>
                    {field.label}
                    <input
                      type="text"
                      placeholder={field.placeholder}
                      value={settings[field.key]}
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
                <label>
                  Journal prompt
                  <input
                    type="text"
                    placeholder="What mattered today?"
                    value={settings.journalPrompt}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        journalPrompt: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  Streak threshold: {settings.consistencyTarget}
                  <input
                    type="range"
                    min="1"
                    max="12"
                    value={settings.consistencyTarget}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        consistencyTarget: Number(event.target.value),
                      }))
                    }
                  />
                </label>
              </div>

              <div className="check-grid">
                <ToggleSetting
                  checked={settings.scoreHabits.breakfastEaten}
                  label="Count breakfast toward score"
                  onChange={(checked) =>
                    setSettings((current) => ({
                      ...current,
                      scoreHabits: { ...current.scoreHabits, breakfastEaten: checked },
                    }))
                  }
                />
                <ToggleSetting
                  checked={settings.scoreHabits.preWorkoutMealEaten}
                  label="Count pre-workout meal toward score"
                  onChange={(checked) =>
                    setSettings((current) => ({
                      ...current,
                      scoreHabits: { ...current.scoreHabits, preWorkoutMealEaten: checked },
                    }))
                  }
                />
                <ToggleSetting
                  checked={settings.scoreHabits.postWorkoutMealEaten}
                  label="Count post-workout meal toward score"
                  onChange={(checked) =>
                    setSettings((current) => ({
                      ...current,
                      scoreHabits: { ...current.scoreHabits, postWorkoutMealEaten: checked },
                    }))
                  }
                />
                <ToggleSetting
                  checked={settings.scoreHabits.workoutCompleted}
                  label="Count workout toward score"
                  onChange={(checked) =>
                    setSettings((current) => ({
                      ...current,
                      scoreHabits: { ...current.scoreHabits, workoutCompleted: checked },
                    }))
                  }
                />
                <ToggleSetting
                  checked={settings.scoreHabits.mealsEaten}
                  label="Count meals eaten toward score"
                  onChange={(checked) =>
                    setSettings((current) => ({
                      ...current,
                      scoreHabits: { ...current.scoreHabits, mealsEaten: checked },
                    }))
                  }
                />
                <ToggleSetting
                  checked={settings.scoreHabits.wakeTime}
                  label="Count wake time toward score"
                  onChange={(checked) =>
                    setSettings((current) => ({
                      ...current,
                      scoreHabits: { ...current.scoreHabits, wakeTime: checked },
                    }))
                  }
                />
                <ToggleSetting
                  checked={settings.scoreHabits.bedtime}
                  label="Count bedtime toward score"
                  onChange={(checked) =>
                    setSettings((current) => ({
                      ...current,
                      scoreHabits: { ...current.scoreHabits, bedtime: checked },
                    }))
                  }
                />
              </div>

              <div className="stack">
                <div className="panel-subsection">
                  <strong>Custom daily habits</strong>
                  <p className="subtle">
                    Add simple yes or no items like stretching, reading, or mobility.
                  </p>
                </div>
                {settings.customHabits.map((habit) => (
                  <div className="habit-edit-row" key={habit.id}>
                    <input
                      type="text"
                      value={habit.label}
                      placeholder="Stretching"
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          customHabits: current.customHabits.map((currentHabit) =>
                            currentHabit.id === habit.id
                              ? { ...currentHabit, label: event.target.value }
                              : currentHabit,
                          ),
                        }))
                      }
                    />
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={() =>
                        setSettings((current) => ({
                          ...current,
                          customHabits: current.customHabits.filter(
                            (currentHabit) => currentHabit.id !== habit.id,
                          ),
                        }))
                      }
                    >
                      Remove
                    </button>
                  </div>
                ))}
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    setSettings((current) => ({
                      ...current,
                      customHabits: [
                        ...current.customHabits,
                        { id: makeId(), label: '' },
                      ],
                    }))
                  }
                >
                  Add daily habit
                </button>
              </div>
            </Panel>

          </section>
        ) : null}

        {tab === 'today' ? (
          <section className="today-layout">
            <Panel
              title={`Daily check-in for ${formatDisplayDate(selectedDate)}`}
              subtitle="The date picker stays editable so you can fix or export past days later"
              actions={
                <div className="action-row">
                  <button className="secondary-button" onClick={copyDaily} type="button">
                    Copy daily only
                  </button>
                  <button
                    className="primary-button"
                    onClick={() => shareDayPacket(selectedDate)}
                    type="button"
                  >
                    Share full day
                  </button>
                </div>
              }
            >
              <div className="form-grid">
                <label>
                  Wake time
                  <input
                    type="time"
                    value={todayEntry.wakeTime}
                    onChange={(event) => handleDailyChange('wakeTime', event.target.value)}
                  />
                  {settings.wakeTimeGoal ? (
                    <span className="field-hint">Goal: {settings.wakeTimeGoal}</span>
                  ) : null}
                </label>
                <label>
                  Bedtime
                  <input
                    type="time"
                    value={todayEntry.bedtime}
                    onChange={(event) => handleDailyChange('bedtime', event.target.value)}
                  />
                  {settings.bedtimeGoal ? (
                    <span className="field-hint">Goal: {settings.bedtimeGoal}</span>
                  ) : null}
                </label>
                <label>
                  Bodyweight
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder={bodyweightPlaceholder}
                    value={todayEntry.bodyweight}
                    onChange={(event) => handleDailyChange('bodyweight', event.target.value)}
                  />
                  {settings.bodyweightGoal ? (
                    <span className="field-hint">Goal: {settings.bodyweightGoal}</span>
                  ) : null}
                </label>
                <label>
                  Meals eaten
                  <input
                    type="number"
                    inputMode="numeric"
                    placeholder={mealsPlaceholder}
                    value={todayEntry.mealsEaten}
                    onChange={(event) => handleDailyChange('mealsEaten', event.target.value)}
                  />
                  {settings.mealsGoal ? (
                    <span className="field-hint">Goal: {settings.mealsGoal}</span>
                  ) : null}
                </label>
                <label>
                  Energy: {todayEntry.energy}/5
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={todayEntry.energy}
                    onChange={(event) =>
                      handleDailyChange('energy', Number(event.target.value))
                    }
                  />
                </label>
                <label>
                  Focus: {todayEntry.focus}/5
                  <input
                    type="range"
                    min="1"
                    max="5"
                    value={todayEntry.focus}
                    onChange={(event) =>
                      handleDailyChange('focus', Number(event.target.value))
                    }
                  />
                </label>
              </div>

              <div className="goal-strip">
                {settings.wakeTimeGoal ? <span className="goal-pill">{settings.wakeTimeGoal}</span> : null}
                {settings.bedtimeGoal ? <span className="goal-pill">{settings.bedtimeGoal}</span> : null}
                {settings.mealsGoal ? <span className="goal-pill">{settings.mealsGoal}</span> : null}
              </div>

              <div className="status-strip">
                <span
                  className={
                    meetsWakeGoal(todayEntry.wakeTime, settings.wakeTimeGoal)
                      ? 'status-pill good'
                      : 'status-pill'
                  }
                >
                  Wake goal:{' '}
                  {todayEntry.wakeTime
                    ? meetsWakeGoal(todayEntry.wakeTime, settings.wakeTimeGoal)
                      ? 'On target'
                      : 'Missed'
                    : 'Not logged'}
                </span>
                <span
                  className={
                    meetsBedtimeGoal(todayEntry.bedtime, settings.bedtimeGoal)
                      ? 'status-pill good'
                      : 'status-pill'
                  }
                >
                  Bedtime goal:{' '}
                  {todayEntry.bedtime
                    ? meetsBedtimeGoal(todayEntry.bedtime, settings.bedtimeGoal)
                      ? 'On target'
                      : 'Missed'
                    : 'Not logged'}
                </span>
              </div>

              <div className="check-grid">
                {checklistItems.map((item) => (
                  <label
                    key={item.id}
                    className={item.checked ? 'check-card completed' : 'check-card'}
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={(event) => item.onChange(event.target.checked)}
                    />
                    <span>{item.label}</span>
                  </label>
                ))}
              </div>

              <label>
                Notes
                <textarea
                  rows={5}
                  placeholder="Quick context: how training felt, why food was off, what helped, what got in the way."
                  value={todayEntry.notes}
                  onChange={(event) => handleDailyChange('notes', event.target.value)}
                />
              </label>
            </Panel>
          </section>
        ) : null}

        {tab === 'journal' ? (
          <section className="today-layout">
            <Panel
              title={`Journal for ${formatDisplayDate(selectedDate)}`}
              subtitle="A quiet place to reflect without the rest of the checklist in view"
              actions={
                <button className="secondary-button" onClick={copyDaily} type="button">
                  Copy daily text
                </button>
              }
            >
              <div className="journal-head">
                <p className="subtle">{settings.journalPrompt}</p>
              </div>
              <label>
                Journal entry
                <textarea
                  rows={14}
                  placeholder={settings.journalPrompt}
                  value={todayEntry.journal}
                  onChange={(event) => handleDailyChange('journal', event.target.value)}
                />
              </label>
            </Panel>
          </section>
        ) : null}

        {tab === 'workouts' ? (
          <section className="workout-layout">
            <Panel
              title="Workout log"
              subtitle="Drafts save automatically for the selected date, even if you close the app"
              actions={
                <button className="primary-button" onClick={saveWorkout} type="button">
                  Save workout
                </button>
              }
            >
              <div className="form-grid">
                <label>
                  Workout name
                  <input
                    type="text"
                    placeholder="Upper 1, Pull, Leg Day"
                    value={workoutDraft.workoutName}
                    onChange={(event) =>
                      updateWorkoutDraft((current) => ({
                        ...current,
                        workoutName: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>

              <label>
                Planned workout
                <textarea
                  rows={6}
                  placeholder="Paste the workout your AI gave you for today here."
                  value={workoutDraft.plannedWorkout}
                  onChange={(event) =>
                    updateWorkoutDraft((current) => ({
                      ...current,
                      plannedWorkout: event.target.value,
                    }))
                  }
                />
              </label>

              <div className="stack">
                {workoutDraft.exercises.map((exercise, exerciseIndex) => (
                  <div className="exercise-card" key={exercise.id}>
                    <div className="exercise-header">
                      <input
                        type="text"
                        placeholder="Exercise name"
                        value={exercise.name}
                        onChange={(event) =>
                          handleExerciseChange(exerciseIndex, {
                            ...exercise,
                            name: event.target.value,
                          })
                        }
                      />
                      <button
                        className="ghost-button"
                        type="button"
                        onClick={() =>
                          updateWorkoutDraft((current) => ({
                            ...current,
                            exercises: current.exercises.filter(
                              (_, index) => index !== exerciseIndex,
                            ),
                          }))
                        }
                        disabled={workoutDraft.exercises.length === 1}
                      >
                        Remove
                      </button>
                    </div>

                    <div className="set-grid">
                      {exercise.sets.map((set, setIndex) => (
                        <div className="set-row" key={setIndex}>
                          <span>Set {setIndex + 1}</span>
                          <input
                            type="number"
                            inputMode="decimal"
                            placeholder="Weight"
                            value={set.weight}
                            onChange={(event) =>
                              handleExerciseChange(exerciseIndex, {
                                ...exercise,
                                sets: exercise.sets.map((currentSet, index) =>
                                  index === setIndex
                                    ? { ...currentSet, weight: event.target.value }
                                    : currentSet,
                                ),
                              })
                            }
                          />
                          <input
                            type="number"
                            inputMode="numeric"
                            placeholder="Reps"
                            value={set.reps}
                            onChange={(event) =>
                              handleExerciseChange(exerciseIndex, {
                                ...exercise,
                                sets: exercise.sets.map((currentSet, index) =>
                                  index === setIndex
                                    ? { ...currentSet, reps: event.target.value }
                                    : currentSet,
                                ),
                              })
                            }
                          />
                        </div>
                      ))}
                    </div>

                    <div className="exercise-actions">
                      <button
                        className="secondary-button"
                        type="button"
                        onClick={() =>
                          handleExerciseChange(exerciseIndex, {
                            ...exercise,
                            sets: [...exercise.sets, { weight: '', reps: '' }],
                          })
                        }
                      >
                        Add set
                      </button>
                    </div>

                    <label>
                      Exercise notes
                      <textarea
                        rows={2}
                        placeholder="Technique, difficulty, pain, best set."
                        value={exercise.notes}
                        onChange={(event) =>
                          handleExerciseChange(exerciseIndex, {
                            ...exercise,
                            notes: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                ))}
              </div>

              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  updateWorkoutDraft((current) => ({
                    ...current,
                    exercises: [...current.exercises, createExercise()],
                  }))
                }
              >
                Add exercise
              </button>

              <label>
                Workout notes
                <textarea
                  rows={3}
                  placeholder="What went well, what felt weak, what to repeat next time."
                  value={workoutDraft.notes}
                  onChange={(event) =>
                    updateWorkoutDraft((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                />
              </label>

              <label>
                Accountability notes
                <textarea
                  rows={3}
                  placeholder="Show-up score, excuses removed, things to tighten up."
                  value={workoutDraft.accountabilityNotes}
                  onChange={(event) =>
                    updateWorkoutDraft((current) => ({
                      ...current,
                      accountabilityNotes: event.target.value,
                    }))
                  }
                />
              </label>
            </Panel>

            <Panel
              title="Recent workout exports"
              subtitle="One click to paste a clean log into your coaching memory file"
            >
              <div className="stack">
                {workouts.slice(0, 6).map((workout) => (
                  <div className="history-row" key={workout.id}>
                    <div>
                      <strong>{workout.workoutName || 'Untitled workout'}</strong>
                      <p>
                        {formatDisplayDate(workout.date)} · {workout.exercises.length}{' '}
                        exercises
                      </p>
                    </div>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => copyWorkout(workout)}
                    >
                      Copy markdown
                    </button>
                  </div>
                ))}
                {workouts.length === 0 ? (
                  <p className="empty-state">No workouts logged yet.</p>
                ) : null}
              </div>
            </Panel>
          </section>
        ) : null}

        {tab === 'history' ? (
          <section className="history-layout">
            <Panel
              title="Recent daily entries"
              subtitle="Quick proof that the habits are stacking up"
            >
              <div className="stack">
                {recentHistory.map(({ date, entry }) => {
                  const score = getHabitScore(entry, settings);
                  return (
                    <div className="history-row" key={date}>
                      <div>
                        <strong>{formatDisplayDate(date)}</strong>
                        <p>
                          Score {score.completed}/{score.total} · Energy {entry.energy}/5 ·
                          Focus {entry.focus}/5
                        </p>
                      </div>
                      <div className="tag-row">
                        {entry.breakfastEaten ? <span className="tag">Breakfast</span> : null}
                        {entry.workoutCompleted ? <span className="tag">Workout</span> : null}
                        {Number(entry.mealsEaten) > 0 ? (
                          <span className="tag">{entry.mealsEaten} meals</span>
                        ) : null}
                        {entry.bodyweight ? (
                          <span className="tag">{entry.bodyweight} lb</span>
                        ) : null}
                        <button
                          className="secondary-button small-button"
                          type="button"
                          onClick={() => copyDayPacket(date)}
                        >
                          Copy day
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>

            <Panel title="Recent workouts" subtitle="Most recent session logs">
              <div className="stack">
                {workouts.slice(0, 8).map((workout) => (
                  <div className="history-row" key={workout.id}>
                    <div>
                      <strong>{workout.workoutName || 'Untitled workout'}</strong>
                      <p>
                        {formatDisplayDate(workout.date)} · {workout.exercises.length} exercises
                      </p>
                    </div>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => copyWorkout(workout)}
                    >
                      Copy
                    </button>
                  </div>
                ))}
                {workouts.length === 0 ? (
                  <p className="empty-state">No workout history yet.</p>
                ) : null}
              </div>
            </Panel>
          </section>
        ) : null}

        {tab === 'settings' ? (
          <section className="settings-layout">
            <Panel
              title="Backup and restore"
              subtitle="Protect your phone-hosted data with a simple file export"
            >
              <div className="action-row">
                <button
                  className="secondary-button"
                  onClick={() =>
                    downloadBackup({ dailyEntries, workouts, settings, workoutDrafts })
                  }
                  type="button"
                >
                  Export full backup
                </button>
                <label className="file-button">
                  <input
                    type="file"
                    accept="application/json"
                    onChange={importBackup}
                  />
                  Import backup
                </label>
              </div>
              <ul className="plain-list">
                <li>Export a backup before big app updates or before clearing your browser/app data.</li>
                <li>Keep the backup file somewhere you trust, like Files, iCloud Drive, or Google Drive.</li>
                <li>Import replaces the current in-app state with the backup file you choose.</li>
              </ul>
            </Panel>

            <Panel
              title="Phone-first install"
              subtitle="Use this as an app on your phone, with local storage on the device itself"
              actions={
                installPrompt && !isStandalone ? (
                  <button className="primary-button" onClick={triggerInstall} type="button">
                    Install app
                  </button>
                ) : undefined
              }
            >
              <ul className="plain-list">
                <li>After install, the app runs from your phone home screen like a lightweight app.</li>
                <li>Your entries stay on the phone in that browser app storage.</li>
                <li>Daily use does not depend on your computer once it is installed.</li>
                <li>For iPhone Safari, use Share then Add to Home Screen if no install button appears.</li>
              </ul>
            </Panel>
          </section>
        ) : null}
      </main>
        {/* Bottom tab bar — mobile only */}
      <nav className="bottom-nav" aria-label="Main navigation">
        {tabs.map((item) => (
          <button
            key={item.id}
            className={item.id === tab ? 'bottom-nav-button active' : 'bottom-nav-button'}
            onClick={() => setTab(item.id)}
            type="button"
          >
            <span className="bottom-nav-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
        <button
          className={tab === 'settings' ? 'bottom-nav-button active' : 'bottom-nav-button'}
          onClick={() => setTab('settings')}
          type="button"
        >
          <span className="bottom-nav-icon">⚙️</span>
          <span>Settings</span>
        </button>
      </nav>
    </div>
  );
}

function ToggleSetting(props: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="check-card">
      <input
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <span>{props.label}</span>
    </label>
  );
}

function RangeToggle<T extends string | number>(props: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="range-toggle" role="tablist" aria-label="Chart range">
      {props.options.map((option) => (
        <button
          key={String(option.value)}
          className={
            option.value === props.value ? 'range-button active' : 'range-button'
          }
          onClick={() => props.onChange(option.value)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function MetricCard(props: { label: string; value: string; detail: string }) {
  return (
    <div className="metric-card">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
      <p>{props.detail}</p>
    </div>
  );
}

function Panel(props: {
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <div className="panel-head">
        <div>
          <h3>{props.title}</h3>
          <p>{props.subtitle}</p>
        </div>
        {props.actions ? <div>{props.actions}</div> : null}
      </div>
      {props.children}
    </section>
  );
}

function MiniBarChart(props: {
  data: { label: string; value: number }[];
  suffix?: string;
}) {
  const max = Math.max(...props.data.map((point) => point.value), 1);

  return (
    <div className="mini-chart">
      {props.data.map((point) => (
        <div className="bar-group" key={point.label}>
          <div
            className="bar"
            style={{ height: `${Math.max((point.value / max) * 100, 6)}%` }}
          />
          <strong>
            {point.value}
            {props.suffix ?? ''}
          </strong>
          <span>{point.label}</span>
        </div>
      ))}
    </div>
  );
}

function MiniLineChart(props: {
  data: { label: string; value: number }[];
}) {
  const plotted = props.data.filter((point) => point.value > 0);

  if (plotted.length < 2) {
    return <p className="empty-state">Add at least two bodyweight entries to see a trend.</p>;
  }

  const values = plotted.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 1);

  const points = plotted
    .map((point, index) => {
      const x = (index / (plotted.length - 1)) * 100;
      const y = 100 - ((point.value - min) / range) * 100;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div className="line-chart-wrap">
      <svg className="line-chart" viewBox="0 0 100 100" preserveAspectRatio="none">
        <polyline fill="none" stroke="currentColor" strokeWidth="3" points={points} />
      </svg>
      <div className="line-chart-labels">
        <span>{plotted[0].label}</span>
        <span>
          {min.toFixed(1)} - {max.toFixed(1)}
        </span>
        <span>{plotted[plotted.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function SleepTimingChart(props: {
  data: { label: string; wakeValue: number | null; bedValue: number | null }[];
}) {
  const wakePoints = props.data.filter((point) => point.wakeValue !== null);
  const bedPoints = props.data.filter((point) => point.bedValue !== null);

  if (wakePoints.length < 2 && bedPoints.length < 2) {
    return <p className="empty-state">Add a few wake and bedtime entries to see your timing pattern.</p>;
  }

  const allValues = [
    ...wakePoints.map((point) => point.wakeValue as number),
    ...bedPoints.map((point) => point.bedValue as number),
  ];
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = Math.max(max - min, 1);

  const makePoints = (
    key: 'wakeValue' | 'bedValue',
    only: { label: string; wakeValue: number | null; bedValue: number | null }[],
  ) =>
    only
      .map((point) => {
        const index = props.data.findIndex((candidate) => candidate.label === point.label);
        const x = props.data.length <= 1 ? 0 : (index / (props.data.length - 1)) * 100;
        const value = point[key] as number;
        const y = 100 - ((value - min) / range) * 100;
        return `${x},${y}`;
      })
      .join(' ');

  return (
    <div className="line-chart-wrap">
      <svg className="line-chart sleep-chart" viewBox="0 0 100 100" preserveAspectRatio="none">
        {wakePoints.length >= 2 ? (
          <polyline
            fill="none"
            stroke="#294032"
            strokeWidth="3"
            points={makePoints('wakeValue', wakePoints)}
          />
        ) : null}
        {bedPoints.length >= 2 ? (
          <polyline
            fill="none"
            stroke="#d99251"
            strokeWidth="3"
            points={makePoints('bedValue', bedPoints)}
          />
        ) : null}
      </svg>
      <div className="chart-legend">
        <span><i className="legend-dot wake" /> Wake time</span>
        <span><i className="legend-dot bed" /> Bedtime</span>
      </div>
      <div className="line-chart-labels">
        <span>{props.data[0]?.label}</span>
        <span>Earlier to later</span>
        <span>{props.data[props.data.length - 1]?.label}</span>
      </div>
    </div>
  );
}

export default App;
