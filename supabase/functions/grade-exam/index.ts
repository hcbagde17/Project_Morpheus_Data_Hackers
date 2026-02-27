// Supabase Edge Function: Bulk Grade Exam
// Deploy with: supabase functions deploy grade-exam

// @deno-types="https://deno.land/x/types/index.d.ts"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req: Request) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { sessionId } = await req.json();

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // Get session
        const { data: session } = await supabaseClient
            .from('exam_sessions')
            .select('*, tests(*)')
            .eq('id', sessionId)
            .single();

        if (!session) {
            return new Response(
                JSON.stringify({ error: 'Session not found' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
            );
        }

        // Get all questions for this test
        const { data: questions } = await supabaseClient
            .from('questions')
            .select('*')
            .eq('test_id', session.test_id);

        // Get student answers
        const { data: answers } = await supabaseClient
            .from('answers')
            .select('*')
            .eq('session_id', sessionId);

        // Calculate score
        let totalScore = 0;
        for (const question of questions || []) {
            const answer = answers?.find((a: any) => a.question_id === question.id);
            if (!answer) continue;

            const correctAnswerSorted = JSON.stringify(question.correct_answer.sort());
            const studentAnswerSorted = JSON.stringify((answer.selected_answer || []).sort());

            if (correctAnswerSorted === studentAnswerSorted) {
                totalScore += question.marks;
            } else if (session.tests?.settings?.negative_marking) {
                totalScore -= question.negative_marks || 0;
            }
        }

        // Update session with final score
        await supabaseClient
            .from('exam_sessions')
            .update({ score: Math.max(0, totalScore) })
            .eq('id', sessionId);

        return new Response(
            JSON.stringify({ success: true, score: totalScore, totalMarks: session.tests?.total_marks }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );

    } catch (error) {
        return new Response(
            JSON.stringify({ error: (error as Error).message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
});
