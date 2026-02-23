import { createClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Database } from '@/types/database';
import { loadBootstrappedTestUsers, type TestUserKey } from '../fixtures/users';

const requireEnv = (key: 'SUPABASE_URL' | 'SUPABASE_ANON_KEY' | 'SUPABASE_SERVICE_ROLE_KEY') => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing ${key} for local Supabase tests.`);
  return value;
};

export const localSupabaseEnv = {
  url: requireEnv('SUPABASE_URL'),
  anonKey: requireEnv('SUPABASE_ANON_KEY'),
  serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
};

export const serviceSupabase = createClient<Database>(
  localSupabaseEnv.url,
  localSupabaseEnv.serviceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  }
);

export async function signInAsTestUser(userKey: TestUserKey) {
  const users = loadBootstrappedTestUsers();
  const user = users[userKey];
  const { error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  if (error) throw error;
  return user;
}

export async function signOutTestUser() {
  await supabase.auth.signOut();
}

export async function getCurrentAuthUserId(): Promise<string | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  return data.user?.id ?? null;
}

export async function getFixtureCommunityByName(name = 'TEST:RLS Community') {
  const { data, error } = await serviceSupabase
    .from('communities')
    .select('id, name')
    .eq('name', name)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) {
    throw new Error(
      `Fixture community "${name}" not found. Run "npm run test:db" (or at least db reset + fixtures) first.`
    );
  }
  return data;
}

export async function getFixtureChannelByName(input: { communityId: string; name: string }) {
  const { data, error } = await serviceSupabase
    .from('channels')
    .select('id, community_id, name')
    .eq('community_id', input.communityId)
    .eq('name', input.name)
    .order('position', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) {
    throw new Error(`Fixture channel "${input.name}" not found in community ${input.communityId}.`);
  }
  return data;
}
