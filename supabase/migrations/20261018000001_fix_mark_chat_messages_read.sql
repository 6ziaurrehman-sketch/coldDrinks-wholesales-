-- ==============================================================================
-- Migration: Fix mark_chat_messages_read & Add UPDATE policy for messages
-- Description:
-- 1. Updates mark_chat_messages_read so it marks read all incoming messages from
--    the other party (sender_id != auth.uid()), whether buyer or wholesaler.
-- 2. Adds an UPDATE policy on public.messages for conversation participants.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.mark_chat_messages_read(p_conversation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
BEGIN
  IF NOT public.can_access_conversation(p_conversation_id) THEN
    RETURN jsonb_build_object('success', false, 'count', 0);
  END IF;

  UPDATE public.messages
  SET read_at = now()
  WHERE conversation_id = p_conversation_id
    AND (sender_id IS DISTINCT FROM auth.uid())
    AND read_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('success', true, 'count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_chat_messages_read(uuid) TO authenticated, anon;

-- Allow conversation participants to update read_at
DROP POLICY IF EXISTS "Conversation participants can update read_at" ON public.messages;
CREATE POLICY "Conversation participants can update read_at"
  ON public.messages FOR UPDATE
  TO authenticated
  USING (public.can_access_conversation(conversation_id))
  WITH CHECK (public.can_access_conversation(conversation_id));
