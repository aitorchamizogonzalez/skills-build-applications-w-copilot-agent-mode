import { CapabilityCard } from './CapabilityCard.js';
import { getJson } from '../api/client.js';

type WorkoutSuggestion = { title: string; focus: string; minutes: number; difficulty: string; reason: string };
type WorkoutResponse = { suggestions: WorkoutSuggestion[] };
const loadWorkoutSuggestions = async () => (
  await getJson<WorkoutResponse>(`/api/workouts/suggestions/${encodeURIComponent('mona@example.com')}`)
).suggestions;

export default function Workouts() {
  return (
    <CapabilityCard
      title="Workout suggestions"
      description="Recommend workouts from activity patterns."
      emptyMessage="No workout suggestions available."
      load={loadWorkoutSuggestions}
      renderItem={(workout) => `${workout.title} · ${workout.focus} · ${workout.minutes} minutes · ${workout.difficulty}. ${workout.reason}`}
    />
  );
}
