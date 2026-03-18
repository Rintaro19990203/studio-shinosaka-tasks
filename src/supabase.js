import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://ntnkhngzjzvqgsofspmt.supabase.co'
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im50bmtobmd6anp2cWdzb2ZzcG10Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2ODg5OTksImV4cCI6MjA4OTI2NDk5OX0.fb3hqXSqOZNNcQFwaOtAFJaO9kFmd9zOqiLFdV9plK0'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
