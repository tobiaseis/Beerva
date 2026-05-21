delete from public.challenges
where slug = 'karneval-test';

notify pgrst, 'reload schema';
