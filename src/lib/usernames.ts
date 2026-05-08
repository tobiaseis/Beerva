export const normalizeUsername = (value: string) => value.trim().replace(/\s+/g, ' ');

export const isUsernameTakenError = (error: any) => {
  const message = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  const constraint = String(error?.constraint || '').toLowerCase();

  return (
    error?.code === '23505' &&
    (
      message.includes('profiles_username') ||
      details.includes('profiles_username') ||
      constraint.includes('profiles_username') ||
      message.includes('duplicate key')
    )
  );
};

export const getUsernameSaveErrorMessage = (error: any) => (
  isUsernameTakenError(error)
    ? 'That username is already taken. Try another one.'
    : error?.message || 'Please try again.'
);
