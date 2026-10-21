// Elongo : réinitialisation du mot de passe d'un membre. Supabase Edge Function « account » (Deno).
//
// Les comptes sont créés avec un numéro de téléphone (adresse privée <chiffres>@tel.elongo.app) : personne n'a de boîte e-mail,
// donc le lien de réinitialisation de Supabase ne peut pas servir. Un organisateur réinitialise le mot de passe d'un membre :
//   { kind: 'resetpw', tontine_id, member_id }   répond { password } : un mot de passe provisoire, à donner au membre
// Le membre devra en choisir un nouveau à sa prochaine connexion (user_metadata.must_change).
//
// Règles : l'appelant est organisateur de la tontine (créateur ou membre actif nommé organisateur), le membre appartient à cette
// tontine, a un compte, et n'est pas l'appelant (pour changer son propre mot de passe, « Mon compte »).
// SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont fournis automatiquement par Supabase.
//
// Toute la logique est dans handle() et reçoit ses dépendances : tests/account.mjs la teste sans Deno ni Supabase.

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'access-control-allow-methods': 'POST, OPTIONS',
};

// No look-alike characters (0/o, 1/l/i) and lower case only: the password is read out or typed from a message.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function tempPassword(random: (n: number) => Uint8Array, len = 8): string {
  let out = '';
  const limit = 256 - (256 % ALPHABET.length);   // rejection sampling: every letter is equally likely
  while (out.length < len) for (const b of random(len)) if (b < limit && out.length < len) out += ALPHABET[b % ALPHABET.length];
  return out;
}

export async function handle(req: Request, deps: any): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const json = (obj: unknown, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' } });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }

  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const uid = token ? await deps.userIdFromToken(token) : null;
    if (!uid) return json({ error: 'unauthorized' }, 401);

    if (body.kind === 'resetpw') {
      const t = await deps.getTontine(body.tontine_id);
      if (!t || !(await deps.isOrganizer(t, uid))) return json({ error: 'forbidden' }, 403);
      const m = await deps.getMember(body.member_id);
      if (!m || m.tontine_id !== t.id) return json({ error: 'not_found' }, 404);
      if (!m.user_id) return json({ error: 'no_account' }, 409);
      if (m.user_id === uid) return json({ error: 'self' }, 400);
      const password = tempPassword(deps.random);
      await deps.setPassword(m.user_id, password);
      return json({ password });
    }
    return json({ error: 'unknown_kind' }, 400);
  } catch (e) {
    return json({ error: 'server_error', detail: String((e as any)?.message || e) }, 500);
  }
}

// ---------- Deno wiring (not exercised by tests/account.mjs) ----------
const D = (globalThis as any).Deno;
if (D && D.serve) {
  let ready: Promise<any> | null = null;
  const setup = () => ready ||= (async () => {
    const { createClient } = await import('npm:@supabase/supabase-js@2');
    const env = (k: string) => D.env.get(k) || '';
    const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
    const one = async (q: any) => { const { data, error } = await q; if (error) throw error; return data; };
    return {
      random: (n: number) => crypto.getRandomValues(new Uint8Array(n)),
      userIdFromToken: async (token: string) => { const { data, error } = await admin.auth.getUser(token); return error ? null : data.user?.id ?? null; },
      getTontine: (id: string) => one(admin.from('tontines').select('*').eq('id', id).maybeSingle()),
      getMember: (id: string) => one(admin.from('members').select('id,tontine_id,name,user_id').eq('id', id).maybeSingle()),
      isOrganizer: async (t: any, uid: string) => t.owner_id === uid || !!(await one(admin.from('members').select('id').eq('tontine_id', t.id).eq('user_id', uid).eq('status', 'active').eq('is_organizer', true).maybeSingle())),
      setPassword: async (uid: string, password: string) => {
        const { data, error } = await admin.auth.admin.getUserById(uid); if (error) throw error;
        const r = await admin.auth.admin.updateUserById(uid, { password, user_metadata: { ...(data.user?.user_metadata || {}), must_change: true } });
        if (r.error) throw r.error;
      },
    };
  })();
  D.serve(async (req: Request) => handle(req, await setup()));
}
