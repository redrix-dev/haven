import { readFileSync } from 'node:fs';
import path from 'node:path';

export const TEST_USER_SPECS = {
  community_owner: {
    email: 'rls-owner@example.test',
    password: 'HavenTest!Owner1',
    username: 'rls_owner',
  },
  member_a: {
    email: 'rls-member-a@example.test',
    password: 'HavenTest!MemberA1',
    username: 'rls_member_a',
  },
  member_b: {
    email: 'rls-member-b@example.test',
    password: 'HavenTest!MemberB1',
    username: 'rls_member_b',
  },
  non_member: {
    email: 'rls-non-member@example.test',
    password: 'HavenTest!NonMember1',
    username: 'rls_non_member',
  },
  server_mod: {
    email: 'rls-server-mod@example.test',
    password: 'HavenTest!ServerMod1',
    username: 'rls_server_mod',
  },
  platform_staff_active: {
    email: 'rls-staff-active@example.test',
    password: 'HavenTest!StaffActive1',
    username: 'rls_staff_active',
  },
  platform_staff_inactive: {
    email: 'rls-staff-inactive@example.test',
    password: 'HavenTest!StaffInactive1',
    username: 'rls_staff_inactive',
  },
} as const;

export type TestUserKey = keyof typeof TEST_USER_SPECS;

export type BootstrappedTestUser = {
  id: string;
  email: string;
  password: string;
  username: string;
};

export type BootstrappedTestUsers = Record<TestUserKey, BootstrappedTestUser>;

let cachedBootstrappedUsers: BootstrappedTestUsers | null = null;

export function loadBootstrappedTestUsers(): BootstrappedTestUsers {
  if (cachedBootstrappedUsers) return cachedBootstrappedUsers;

  const filePath = path.resolve(process.cwd(), 'supabase/tests/.generated/users.json');
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(
      `Missing bootstrapped local test users at ${filePath}. Run "npm run test:db:users" first.`
    );
  }

  const usersRecord = (parsed as { users?: Record<string, unknown> })?.users;
  if (!usersRecord || typeof usersRecord !== 'object') {
    throw new Error(`Invalid users bootstrap file: ${filePath}`);
  }

  const output = {} as BootstrappedTestUsers;
  for (const key of Object.keys(TEST_USER_SPECS) as TestUserKey[]) {
    const row = usersRecord[key] as Partial<BootstrappedTestUser> | undefined;
    if (!row?.id || !row?.email || !row?.password || !row?.username) {
      throw new Error(`Bootstrapped test user "${key}" is missing required fields.`);
    }
    output[key] = {
      id: row.id,
      email: row.email,
      password: row.password,
      username: row.username,
    };
  }

  cachedBootstrappedUsers = output;
  return output;
}

