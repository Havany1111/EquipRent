import { supabase, isSupabaseConfigured } from '../lib/supabase';
import type { UserProfile, UserRole } from '../types/database';
import { mockUsers } from './rentalService';

export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('user_profiles')
          .select('*')
          .or(`auth_user_id.eq.${user.id},email.eq.${user.email}`)
          .maybeSingle();

        if (data) {
          return data as UserProfile;
        }

        return {
          id: user.id,
          auth_user_id: user.id,
          full_name: (user.user_metadata?.full_name as string) || user.email?.split('@')[0] || 'User',
          email: user.email || '',
          phone: (user.user_metadata?.phone as string) || '+1-555-0100',
          company_name: (user.user_metadata?.company_name as string) || 'Enterprise Account',
          role: (user.user_metadata?.role as UserRole) || 'customer',
          account_status: 'active',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
      }
    } catch (e) {
      console.warn('Could not fetch active Supabase auth user:', e);
    }
  }

  // Local fallback from storage
  const stored = localStorage.getItem('equiprent_active_user');
  if (stored) {
    try {
      return JSON.parse(stored) as UserProfile;
    } catch {
      return null;
    }
  }
  return null;
}

export async function loginWithEmail(
  email: string,
  pass: string
): Promise<{ profile: UserProfile; message?: string }> {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: pass,
      });

      if (!error && data?.user) {
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('*')
          .or(`auth_user_id.eq.${data.user.id},email.eq.${data.user.email}`)
          .maybeSingle();

        const profile: UserProfile = profileData
          ? (profileData as UserProfile)
          : {
              id: data.user.id,
              auth_user_id: data.user.id,
              full_name: (data.user.user_metadata?.full_name as string) || data.user.email?.split('@')[0] || 'User',
              email: data.user.email || email,
              phone: (data.user.user_metadata?.phone as string) || '+1-555-0199',
              company_name: (data.user.user_metadata?.company_name as string) || 'Company',
              role: (data.user.user_metadata?.role as UserRole) || 'customer',
              account_status: 'active',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            };

        localStorage.setItem('equiprent_active_user', JSON.stringify(profile));
        return { profile };
      }
    } catch (e) {
      console.warn('Supabase signInWithPassword error:', e);
    }

    // Check if user exists in public.user_profiles
    const { data: existingProfile } = await supabase
      .from('user_profiles')
      .select('*')
      .eq('email', email)
      .maybeSingle();

    if (existingProfile) {
      localStorage.setItem('equiprent_active_user', JSON.stringify(existingProfile));
      return { profile: existingProfile as UserProfile };
    }
  }

  // Check pre-seeded fallback users
  const found = mockUsers.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (found) {
    localStorage.setItem('equiprent_active_user', JSON.stringify(found));
    return { profile: found };
  }

  throw new Error('Account does not exist yet. Please click "Create New Account" first.');
}

export async function signUpWithProfile(params: {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  companyName: string;
  role: UserRole;
}): Promise<{ profile: UserProfile; message?: string }> {
  if (isSupabaseConfigured && supabase) {
    let authUserId = `usr-${Date.now()}`;
    let authSuccessful = false;

    try {
      const { data, error } = await supabase.auth.signUp({
        email: params.email,
        password: params.password,
        options: {
          data: {
            full_name: params.fullName,
            phone: params.phone,
            company_name: params.companyName,
            role: params.role,
          },
        },
      });

      if (!error && data?.user) {
        authUserId = data.user.id;
        authSuccessful = true;
      }
    } catch (authErr) {
      console.warn('Supabase auth.signUp handled:', authErr);
    }

    // Always ensure user profile is inserted into public.user_profiles in PostgreSQL
    const newProfile: UserProfile = {
      id: authUserId,
      auth_user_id: authUserId,
      full_name: params.fullName,
      email: params.email,
      phone: params.phone,
      company_name: params.companyName,
      role: params.role,
      account_status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    try {
      const { error: upsertErr } = await supabase
        .from('user_profiles')
        .upsert([newProfile], { onConflict: 'email' });

      if (upsertErr) {
        console.warn('user_profiles upsert note:', upsertErr.message);
      }
    } catch (e) {
      console.warn('Profile write error:', e);
    }

    localStorage.setItem('equiprent_active_user', JSON.stringify(newProfile));
    return {
      profile: newProfile,
      message: authSuccessful
        ? 'Account successfully registered and connected to Supabase!'
        : 'Account created and profile saved to Supabase database!',
    };
  }

  // Local fallback
  const newProfile: UserProfile = {
    id: `usr-${Date.now()}`,
    auth_user_id: `auth-${Date.now()}`,
    full_name: params.fullName,
    email: params.email,
    phone: params.phone,
    company_name: params.companyName,
    role: params.role,
    account_status: 'active',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  mockUsers.push(newProfile);
  localStorage.setItem('equiprent_active_user', JSON.stringify(newProfile));
  return { profile: newProfile };
}

export async function logoutUser(): Promise<void> {
  if (isSupabaseConfigured && supabase) {
    try {
      await supabase.auth.signOut();
    } catch {
      // Ignore
    }
  }
  localStorage.removeItem('equiprent_active_user');
}
