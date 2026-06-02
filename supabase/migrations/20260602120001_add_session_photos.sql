-- supabase/migrations/20260602120001_add_session_photos.sql

CREATE TABLE public.session_photos (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  image_url text NOT NULL,
  is_keeper boolean DEFAULT false,
  expires_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- RLS Policies
ALTER TABLE public.session_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Session photos are viewable by everyone" 
ON public.session_photos FOR SELECT 
USING (true);

CREATE POLICY "Users can insert session photos for their own sessions" 
ON public.session_photos FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.sessions 
    WHERE sessions.id = session_photos.session_id 
    AND sessions.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete their own session photos"
ON public.session_photos FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.sessions 
    WHERE sessions.id = session_photos.session_id 
    AND sessions.user_id = auth.uid()
  )
);

-- Migrate existing photos
INSERT INTO public.session_photos (session_id, image_url, is_keeper, expires_at)
SELECT id, image_url, true, null
FROM public.sessions
WHERE image_url IS NOT NULL;
