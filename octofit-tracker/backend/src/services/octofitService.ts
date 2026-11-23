import mongoose from 'mongoose';
import { Activity, Team, User, Workout } from '../models/index.js';

type ActivityInput = {
  userId: string;
  teamId: string;
  type: string;
  minutes: number;
};

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === 'object' && input !== null && !Array.isArray(input);
}

function badRequest(message: string): never {
  throw Object.assign(new Error(message), { status: 400 });
}

function notFound(message: string): never {
  throw Object.assign(new Error(message), { status: 404 });
}

export async function listActivities() {
  return Activity.find().lean();
}

export async function createActivity(input: unknown) {
  if (!isRecord(input)) badRequest('Activity must be an object');
  const { userId, teamId, type, minutes } = input;
  if (typeof userId !== 'string' || !mongoose.isObjectIdOrHexString(userId)) badRequest('A valid userId is required');
  if (typeof teamId !== 'string' || !mongoose.isObjectIdOrHexString(teamId)) badRequest('A valid teamId is required');
  if (typeof type !== 'string' || type.trim().length === 0) badRequest('Activity type is required');
  if (typeof minutes !== 'number' || !Number.isFinite(minutes) || minutes <= 0) badRequest('Minutes must be a positive number');

  const [user, team] = await Promise.all([User.findById(userId), Team.findById(teamId)]);
  if (!user) notFound('User not found');
  if (!team) notFound('Team not found');

  const activity = await Activity.create({
    user: user._id,
    team: team._id,
    type: type.trim(),
    minutes,
    points: minutes,
    occurredAt: new Date(),
  });
  return activity.toObject();
}

export async function listTeams() {
  return Team.find().lean();
}

export async function createTeam(input: unknown) {
  if (!isRecord(input)) badRequest('Team must be an object');
  const { name, mascot, members } = input;
  if (typeof name !== 'string' || name.trim().length === 0) badRequest('Team name is required');
  if (typeof mascot !== 'string' || mascot.trim().length === 0) badRequest('Team mascot is required');
  if (members !== undefined && !Array.isArray(members)) badRequest('Members must be an array of user IDs');

  const memberIds = members === undefined ? [] : [...new Set(members)];
  if (memberIds.some((memberId) => typeof memberId !== 'string' || !mongoose.isObjectIdOrHexString(memberId))) {
    badRequest('Every member must have a valid user ID');
  }
  const foundMembers = await User.find({ _id: { $in: memberIds } }).select('_id').lean();
  if (foundMembers.length !== memberIds.length) notFound('One or more team members were not found');

  const team = await Team.create({ name: name.trim(), mascot: mascot.trim(), members: memberIds });
  return team.toObject();
}

export async function getLeaderboard() {
  const teams = await Team.aggregate<{ teamName: string; totalPoints: number }>([
    {
      $lookup: {
        from: Activity.collection.name,
        localField: '_id',
        foreignField: 'team',
        as: 'activities',
      },
    },
    {
      $project: {
        _id: 0,
        teamName: '$name',
        totalPoints: { $sum: '$activities.points' },
      },
    },
    { $sort: { totalPoints: -1, teamName: 1 } },
  ]);
  return teams.map((team, index) => ({ ...team, rank: index + 1 }));
}

export async function suggestWorkouts(userEmail: string) {
  const user = await User.findOne({ email: userEmail }).lean();
  if (!user) notFound('User not found');

  const [recentActivities, workouts] = await Promise.all([
    Activity.find({ user: user._id }).sort({ occurredAt: -1 }).limit(5).lean(),
    Workout.find().lean(),
  ]);
  const recentType = recentActivities[0]?.type;
  const recentFocus = recentType === 'run' || recentType === 'cycle' || recentType === 'walk'
    ? 'endurance'
    : recentType;
  const preferredFocuses = [user.fitnessGoal, recentFocus].filter((focus): focus is string => Boolean(focus));
  const sortedWorkouts = [...workouts].sort((a, b) => {
    const aRank = preferredFocuses.indexOf(a.focus);
    const bRank = preferredFocuses.indexOf(b.focus);
    return (aRank < 0 ? Number.MAX_SAFE_INTEGER : aRank) - (bRank < 0 ? Number.MAX_SAFE_INTEGER : bRank)
      || a.title.localeCompare(b.title);
  });

  return sortedWorkouts.map((workout) => {
    const focusIndex = preferredFocuses.indexOf(workout.focus);
    const reason = focusIndex === 0
      ? `Supports your ${user.fitnessGoal} fitness goal.`
      : focusIndex > 0 && recentType
        ? `Recommended based on your recent ${recentType} activity.`
        : `A general workout option for your ${user.fitnessGoal} fitness goal.`;
    return { ...workout, reason };
  });
}

export { User };
