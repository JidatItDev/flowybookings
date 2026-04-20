ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_log;
ALTER TABLE public.activity_log REPLICA IDENTITY FULL;