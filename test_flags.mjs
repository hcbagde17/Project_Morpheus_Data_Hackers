import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://itdratwmxbugkmbhoiyw.supabase.co';
const supabaseAnonKey = 'sb_publishable_C9Uehgg5m0fC5O1-RmrQoQ_pldk3tsU';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function test() {
    let query = supabase.from('flags').select('severity');
    const { data, error } = await query;
    if (error) {
        console.error("ERROR:", error);
    } else {
        const severities = [...new Set(data.map(d => d.severity))];
        console.log("Unique Severities:", severities);
    }
}

test();
