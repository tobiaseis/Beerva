import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { EMPTY_WEEKLY_STREAK, fetchWeeklyStreaks, WeeklyStreak } from './weeklyStreaks';

// Refetches whenever the screen gains focus, so a newly logged night shows up
// as soon as the user returns to a profile.
export const useWeeklyStreak = (userId: string | null | undefined): WeeklyStreak => {
  const [streak, setStreak] = useState<WeeklyStreak>(EMPTY_WEEKLY_STREAK);

  useFocusEffect(
    useCallback(() => {
      if (!userId) {
        setStreak(EMPTY_WEEKLY_STREAK);
        return undefined;
      }

      let cancelled = false;
      fetchWeeklyStreaks([userId]).then((streaks) => {
        if (!cancelled) setStreak(streaks.get(userId) || EMPTY_WEEKLY_STREAK);
      });

      return () => {
        cancelled = true;
      };
    }, [userId])
  );

  return streak;
};
