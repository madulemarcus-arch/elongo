// Connexion au serveur Supabase (voir README, « Mettre en place le serveur »).
// L'URL et la clé « anon » sont publiques par conception : la sécurité repose sur les règles RLS de supabase/schema.sql.
// Laissées vides, l'application tourne en mode démo (données locales à l'appareil).
window.LISANGA_CONFIG = {
  supabaseUrl: '',      // ex. https://abcdefgh.supabase.co
  supabaseAnonKey: ''   // clé « anon public » du projet
};
