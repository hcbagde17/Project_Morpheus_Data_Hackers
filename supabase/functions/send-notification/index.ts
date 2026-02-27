// Supabase Edge Function: Send Notifications
// Deploy with: supabase functions deploy send-notification

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { userId, type, message, metadata } = await req.json();

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // Get user email
        const { data: user } = await supabaseClient
            .from('users')
            .select('email, username')
            .eq('id', userId)
            .single();

        if (!user) {
            return new Response(
                JSON.stringify({ error: 'User not found' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
            );
        }

        // In production, integrate with email service (SendGrid, SES, etc.)
        // For now, just log the notification
        console.log(`[NOTIFICATION] To: ${user.email}, Type: ${type}, Message: ${message}`);

        // Store notification in database (if you create a notifications table)
        // await supabaseClient.from('notifications').insert({
        //   user_id: userId,
        //   type,
        //   message,
        //   metadata,
        //   read: false
        // })

        return new Response(
            JSON.stringify({ success: true, recipient: user.email }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );

    } catch (error) {
        return new Response(
            JSON.stringify({ error: (error as Error).message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
});
