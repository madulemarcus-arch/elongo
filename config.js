// Connexion au serveur Supabase (voir README, « Mettre en place le serveur »).
// L'URL et la clé « anon » sont publiques par conception : la sécurité repose sur les règles RLS de supabase/schema.sql.
// Ne mettez jamais ici la clé « service_role » ou « secret ». Laissées vides, l'application tourne en mode démo.
window.LISANGA_CONFIG = {
  supabaseUrl: 'https://xzwdtjsxkwvtqqwqfevn.supabase.co',
  pushFunction: 'quick-worker',   // nom (slug) de la fonction d'envoi des notifications dans Supabase
  vapidPublicKey: 'BNdckmrUsrW5cyZYISTbDpnDHw_ZSy7eIEAP2yg11VAeG7xEvIjyn7y90qEoEYd36xfj9V6ygHSLl71NZJBRXu4',   // clé publique des notifications push (voir README)
  supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6d2R0anN4a3d2dHFxd3FmZXZuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE2MTI3NjIsImV4cCI6MjEwNzE4ODc2Mn0.MO9txGgXFWIGCaSLxOIF8VQog6SjdcXkCI8o373baT4'
};
