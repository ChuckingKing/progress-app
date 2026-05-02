export type DailyEntry = {
  date: string;
  wakeTime: string;
  breakfastEaten: boolean;
  preWorkoutMealEaten: boolean;
  postWorkoutMealEaten: boolean;
  workoutCompleted: boolean;
  bedtime: string;
  bodyweight: string;
  mealsEaten: string;
  energy: number;
  focus: number;
  notes: string;
  journal: string;
  customHabits: Record<string, boolean>;
};

export type ExerciseSet = {
  weight: string;
  reps: string;
};

export type ExerciseLog = {
  id: string;
  name: string;
  sets: ExerciseSet[];
  notes: string;
};

export type WorkoutLog = {
  id: string;
  date: string;
  workoutName: string;
  plannedWorkout: string;
  exercises: ExerciseLog[];
  notes: string;
  accountabilityNotes: string;
};

export type GoalSettings = {
  bodyweightGoal: string;
  mealsGoal: string;
  wakeTimeGoal: string;
  bedtimeGoal: string;
  trainingGoal: string;
  journalPrompt: string;
  consistencyTarget: number;
  customHabits: HabitGoal[];
  scoreHabits: {
    breakfastEaten: boolean;
    preWorkoutMealEaten: boolean;
    postWorkoutMealEaten: boolean;
    workoutCompleted: boolean;
    wakeTime: boolean;
    bedtime: boolean;
    mealsEaten: boolean;
  };
};

export type HabitGoal = {
  id: string;
  label: string;
};

export type AppState = {
  dailyEntries: DailyEntry[];
  workouts: WorkoutLog[];
  settings: GoalSettings;
  workoutDrafts: Record<string, WorkoutLog>;
};
