import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface PushPayload {
  notification_id: string;
  user_id: string;
  shop_id: string;
  type: string;
  category: 'orders' | 'delivery' | 'payments' | 'discounts' | 'messages' | 'offers';
  title: string;
  body: string;
  data?: Record<string, any>;
  is_critical?: boolean;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

/**
 * Checks if current time is within quiet hours for Asia/Karachi timezone
 */
export function isWithinQuietHours(
  startStr: string = '22:00',
  endStr: string = '08:00',
  currentTimeZone: string = 'Asia/Karachi',
  now: Date = new Date(),
): boolean {
  // Convert current time to target timezone HH:MM
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: currentTimeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = timeFormatter.formatToParts(now);
  const hourPart = parts.find((p) => p.type === 'hour')?.value || '00';
  const minutePart = parts.find((p) => p.type === 'minute')?.value || '00';
  const currentMinutes = parseInt(hourPart, 10) * 60 + parseInt(minutePart, 10);

  const [startH, startM] = startStr.split(':').map(Number);
  const [endH, endM] = endStr.split(':').map(Number);
  const startMinutes = (startH || 0) * 60 + (startM || 0);
  const endMinutes = (endH || 0) * 60 + (endM || 0);

  if (startMinutes < endMinutes) {
    // Normal window, e.g. 01:00 to 07:00
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight window, e.g. 22:00 to 08:00
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

serve(async (req: Request) => {
  try {
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const payload: PushPayload = await req.json();
    const {
      notification_id,
      user_id,
      shop_id,
      type,
      category,
      title,
      body,
      data = {},
      is_critical = false,
    } = payload;

    if (!user_id || !title || !body) {
      return new Response(JSON.stringify({ error: 'Missing required notification fields' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Fetch user notification preferences
    const { data: prefs, error: prefsError } = await supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', user_id)
      .eq('shop_id', shop_id)
      .single();

    if (!prefsError && prefs) {
      // Category check
      const categoryCol = `${category}_enabled`;
      if (prefs[categoryCol] === false) {
        return new Response(
          JSON.stringify({ message: 'Suppressed: Category disabled by user preference' }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      // Quiet hours check (Critical events bypass quiet hours)
      if (prefs.quiet_hours_enabled && !is_critical) {
        const inQuiet = isWithinQuietHours(
          prefs.quiet_hours_start,
          prefs.quiet_hours_end,
          prefs.timezone || 'Asia/Karachi',
        );

        if (inQuiet) {
          return new Response(
            JSON.stringify({ message: 'Suppressed: Quiet hours in effect in Asia/Karachi' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }
      }
    }

    // 2. Fetch device tokens for user
    const { data: tokens, error: tokensError } = await supabase
      .from('device_tokens')
      .select('token, platform')
      .eq('user_id', user_id);

    if (tokensError || !tokens || tokens.length === 0) {
      return new Response(JSON.stringify({ message: 'No registered device tokens found' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Prepare Expo Push API messages (deduped by notification_id)
    const messages = tokens.map((t: { token: string }) => ({
      to: t.token,
      sound: is_critical ? 'default' : undefined,
      priority: is_critical ? 'high' : 'default',
      title,
      body,
      data: {
        ...data,
        notificationId: notification_id,
        type,
        category,
        shopId: shop_id,
      },
      channelId: is_critical ? 'critical-alerts' : 'default',
    }));

    // 4. Send batch to Expo Push API
    const expoResponse = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(messages),
    });

    const expoResult = await expoResponse.json();
    const tickets = expoResult.data || [];

    // 5. Clean up dead tokens (DeviceNotRegistered)
    const deadTokens: string[] = [];
    tickets.forEach((ticket: any, index: number) => {
      if (
        ticket.status === 'error' &&
        ticket.details &&
        ticket.details.error === 'DeviceNotRegistered'
      ) {
        deadTokens.push(tokens[index].token);
      }
    });

    if (deadTokens.length > 0) {
      await supabase.from('device_tokens').delete().in('token', deadTokens);
    }

    return new Response(
      JSON.stringify({
        success: true,
        sentCount: messages.length,
        deadTokensRemoved: deadTokens.length,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
