// Supabase Edge Function: Generate Test Statistics
// Deploy with: supabase functions deploy test-statistics

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface QuestionStat {
    question_id: string;
    question_text: string;
    correctCount: number;
    totalAttempts: number;
    accuracy: number;
}

serve(async (req: Request) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { testId } = await req.json();

        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
        );

        // Get all sessions for this test
        const { data: sessions } = await supabaseClient
            .from('exam_sessions')
            .select('*')
            .eq('test_id', testId)
            .in('status', ['submitted', 'completed']);

        if (!sessions || sessions.length === 0) {
            return new Response(
                JSON.stringify({ error: 'No completed sessions found' }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 }
            );
        }

        // Calculate statistics
        const scores = sessions.map((s: any) => s.score || 0);
        const totalStudents = sessions.length;
        const avgScore = scores.reduce((a: number, b: number) => a + b, 0) / totalStudents;
        const maxScore = Math.max(...scores);
        const minScore = Math.min(...scores);
        const medianScore = scores.sort((a: number, b: number) => a - b)[Math.floor(totalStudents / 2)];

        // Count flags
        const totalRedFlags = sessions.reduce((sum: number, s: any) => sum + (s.red_flags || 0), 0);
        const totalOrangeFlags = sessions.reduce((sum: number, s: any) => sum + (s.orange_flags || 0), 0);
        const flaggedSessions = sessions.filter((s: any) => s.is_flagged).length;

        // Question-wise analysis
        const { data: questions } = await supabaseClient
            .from('questions')
            .select('id, question_text')
            .eq('test_id', testId);

        const questionStats: QuestionStat[] = [];
        for (const question of questions || []) {
            const { data: answers } = await supabaseClient
                .from('answers')
                .select('is_correct')
                .eq('question_id', question.id);

            const correctCount = answers?.filter((a: any) => a.is_correct).length || 0;
            const totalAttempts = answers?.length || 0;
            const accuracy = totalAttempts > 0 ? (correctCount / totalAttempts) * 100 : 0;

            questionStats.push({
                question_id: question.id,
                question_text: question.question_text.substring(0, 50) + '...',
                correctCount,
                totalAttempts,
                accuracy: Math.round(accuracy),
            });
        }

        return new Response(
            JSON.stringify({
                success: true,
                statistics: {
                    totalStudents,
                    avgScore: Math.round(avgScore),
                    maxScore,
                    minScore,
                    medianScore,
                    totalRedFlags,
                    totalOrangeFlags,
                    flaggedSessions,
                    questionAnalysis: questionStats,
                }
            }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        );

    } catch (error) {
        return new Response(
            JSON.stringify({ error: (error as Error).message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
        );
    }
});
