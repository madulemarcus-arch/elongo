-- Elongo : rappels quotidiens de cotisation par notification push.
-- À exécuter UNE fois dans Supabase > SQL Editor, après avoir déployé la fonction « push » et défini ses secrets (voir README).
-- Remplacez les trois valeurs entre < >. L'heure est en UTC : 07:00 UTC = 08:00 à Bandundu / Kinshasa.
--
--   <ADRESSE_DU_PROJET>  ex. https://abcdefgh.supabase.co  (la fonction s'appelle ici « push » ; si Supabase vous a imposé un autre nom,
--                        remplacez /functions/v1/push par /functions/v1/<ce nom>, et mettez le même nom dans pushFunction de config.js)
--   <CLE_ANON>           la clé « anon public » (celle de config.js)
--   <CRON_SECRET>        le même texte que le secret CRON_SECRET de la fonction

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'elongo-rappels',
  '0 7 * * *',
  $$
  select net.http_post(
    url := '<ADRESSE_DU_PROJET>/functions/v1/push',
    headers := jsonb_build_object(
      'content-type', 'application/json',
      'authorization', 'Bearer <CLE_ANON>',
      'x-cron-secret', '<CRON_SECRET>'),
    body := '{"kind":"reminders"}'::jsonb
  );
  $$
);

-- Pour tester tout de suite, sans attendre demain matin :
--   select net.http_post(url := '<ADRESSE_DU_PROJET>/functions/v1/push', headers := jsonb_build_object('content-type','application/json','authorization','Bearer <CLE_ANON>','x-cron-secret','<CRON_SECRET>'), body := '{"kind":"reminders"}'::jsonb);
-- Pour arrêter les rappels :
--   select cron.unschedule('elongo-rappels');
