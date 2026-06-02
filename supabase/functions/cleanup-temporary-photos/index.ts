// @ts-nocheck
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SESSION_PHOTO_BUCKET = 'session_images';

const getPublicStoragePath = (bucket: string, publicUrl?: string | null) => {
  if (!publicUrl) return null;

  try {
    const url = new URL(publicUrl);
    const marker = `/storage/v1/object/public/${bucket}/`;
    const markerIndex = url.pathname.indexOf(marker);
    if (markerIndex === -1) return null;
    return decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
};

serve(async (req) => {
  try {
    // Only accept POST (can be triggered via cron or manual test)
    if (req.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Find expired photos
    const { data: expiredPhotos, error: fetchError } = await supabase
      .from('session_photos')
      .select('id, image_url')
      .lt('expires_at', new Date().toISOString());

    if (fetchError) throw fetchError;
    if (!expiredPhotos || expiredPhotos.length === 0) {
      return new Response(JSON.stringify({ message: 'No expired photos found', deletedCount: 0 }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let deletedCount = 0;

    // 2. Delete each photo from storage and db
    for (const photo of expiredPhotos) {
      const filePath = getPublicStoragePath(SESSION_PHOTO_BUCKET, photo.image_url);
      if (!filePath) {
        console.error(`Could not parse session photo URL ${photo.image_url}`);
        continue;
      }

      const { error: storageError } = await supabase
        .storage
        .from(SESSION_PHOTO_BUCKET)
        .remove([filePath]);

      if (storageError) {
        console.error(`Failed to delete storage object ${filePath}:`, storageError);
        continue;
      }

      // Delete from DB
      const { error: dbError } = await supabase
        .from('session_photos')
        .delete()
        .eq('id', photo.id);

      if (dbError) {
        console.error(`Failed to delete DB row ${photo.id}:`, dbError);
      } else {
        deletedCount++;
      }
    }

    return new Response(JSON.stringify({ message: 'Cleanup complete', deletedCount }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error: any) {
    console.error('Cleanup function error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
