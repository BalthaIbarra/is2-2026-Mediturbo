import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://nxlkkdycaovukwvlicgb.supabase.co'
const SUPABASE_KEY = 'sb_publishable_XVNEcoCrwOeQkXsgKZPIWg_8hpg3yGq'

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)
