-- Scenarios run as real roles; every assertion raises on failure.
\set ON_ERROR_STOP on
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'orga@x'), ('00000000-0000-0000-0000-00000000000b', 'membre@x'),
  ('00000000-0000-0000-0000-00000000000c', 'intrus@x'), ('00000000-0000-0000-0000-00000000000d', 'demandeur@x');

create function pg_temp.as_user(u text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', u, false); execute 'set role authenticated'; end $$;
create function pg_temp.check(label text, ok boolean) returns void language plpgsql as $$
begin if not ok then raise exception 'ECHEC: %', label; end if; raise notice 'ok  %', label; end $$;
create function pg_temp.fails(label text, stmt text) returns void language plpgsql as $$
begin
  begin execute stmt; exception when others then raise notice 'ok  % (refusé : %)', label, sqlerrm; return; end;
  raise exception 'ECHEC: % aurait dû être refusé', label;
end $$;
create function pg_temp.zero(label text, stmt text) returns void language plpgsql as $$
declare n int; begin execute stmt into n; if n <> 0 then raise exception 'ECHEC: % (% lignes)', label, n; end if; raise notice 'ok  %', label; end $$;

-- organizer creates the tontine
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into tontines (name, amount, start_date) values ('Tontine test', 10000, '2026-01-01') returning id;
select pg_temp.check('owner_id vient de auth.uid()', (select owner_id from tontines) = '00000000-0000-0000-0000-00000000000a');
select pg_temp.fails('créer une tontine au nom d''un autre',
  $$insert into tontines (owner_id, name, amount, start_date) values ('00000000-0000-0000-0000-00000000000b', 'x', 1, '2026-01-01')$$);
select pg_temp.fails('montant négatif', $$update tontines set amount = -1$$);
reset role;
select set_config('app.t', (select id::text from tontines), false) as t \gset
select set_config('app.code', (select code from tontines), false) as code \gset

-- manual member + a linked member row for user b (as accepted request would give)
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into members (tontine_id, name, position) values (current_setting('app.t')::uuid, 'Alice', 1) returning id;
select pg_temp.check('aperçu par code (organisateur)', (select count(*) from tontine_preview(current_setting('app.code'))) = 1);

-- b joins by code -> pending, invisible chat, own request visible
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check('aperçu par code', (select name from tontine_preview(upper(current_setting('app.code')))) = 'Tontine test');
select join_tontine(current_setting('app.code'), '  Bob  ', '0812345678');
select pg_temp.check('nom nettoyé, statut pending', (select name || status from members where user_id = '00000000-0000-0000-0000-00000000000b') = 'Bobpending');
select pg_temp.fails('double inscription', format('select join_tontine(%L, ''Bob2'')', current_setting('app.code')));
select pg_temp.fails('code invalide', $$select join_tontine('zzzz', 'Bob')$$);
select pg_temp.zero('demandeur: aucun autre membre visible', $$select count(*)::int from members where name = 'Alice'$$);
select pg_temp.zero('demandeur: pas de téléphone lisible', $$select count(*)::int from contacts$$);
select pg_temp.check('demandeur voit le nom de la tontine', (select count(*) from tontines) = 1);
select pg_temp.zero('demandeur ne peut pas se valider', $$with u as (update members set status = 'active' returning 1) select count(*)::int from u$$);
select pg_temp.fails('demandeur ne peut pas écrire dans members', format('insert into members (tontine_id, name) values (%L, ''Faux'')', current_setting('app.t')));
select pg_temp.fails('demandeur ne lit pas le chat', $$insert into messages (tontine_id, author_name, body) values (current_setting('app.t')::uuid, 'Bob', 'salut')$$);

-- organizer sees phone, accepts
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check('organisateur lit le téléphone', (select phone from contacts) = '0812345678');
update members set status = 'active', position = 2 where user_id = '00000000-0000-0000-0000-00000000000b';

-- active member
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check('membre actif voit les membres', (select count(*) from members) = 2);
select pg_temp.zero('membre actif ne lit pas les téléphones', $$select count(*)::int from contacts$$);
select pg_temp.zero('membre ne modifie pas les réglages', $$with u as (update tontines set amount = 1 returning 1) select count(*)::int from u$$);
select pg_temp.fails('membre ne verse pas', format('insert into payments (tontine_id, round, member_id, amount, paid_on) select %L, 0, id, 5, current_date from members limit 1', current_setting('app.t')));
select pg_temp.fails('membre ne remet pas la cagnotte', format('insert into payouts (tontine_id, round, member_id, amount, paid_on) select %L, 0, id, 5, current_date from members limit 1', current_setting('app.t')));
insert into topics (tontine_id, title, author_name) values (current_setting('app.t')::uuid, 'Retard de mars', 'Bob') returning id;
select pg_temp.fails('titre de sujet en double (casse)', format('insert into topics (tontine_id, title, author_name) values (%L, ''retard de MARS'', ''Bob'')', current_setting('app.t')));
insert into messages (tontine_id, topic_id, author_name, body) select tontine_id, id, 'Bob', 'Bonjour' from topics returning id;
insert into messages (tontine_id, author_name, body, att) values (current_setting('app.t')::uuid, 'Bob', '', '{"path":"x","kind":"image"}');
select pg_temp.fails('message vide', format('insert into messages (tontine_id, author_name, body) values (%L, ''Bob'', '''')', current_setting('app.t')));
select pg_temp.fails('message signé d''un autre', format('insert into messages (tontine_id, author_id, author_name, body) values (%L, %L, ''Alice'', ''x'')', current_setting('app.t'), '00000000-0000-0000-0000-00000000000a'));

-- organizer payments / payouts / moderation
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into payments (tontine_id, round, member_id, amount, paid_on, log)
  select tontine_id, 0, id, 4000, current_date, '[{"a":4000,"at":"2026-01-01"}]' from members where name = 'Alice' returning round;
update payments set amount = 10000, done_on = current_date;
insert into payouts (tontine_id, round, member_id, amount, paid_on) select tontine_id, 0, id, 20000, current_date from members where name = 'Alice' returning round;
select pg_temp.fails('même tour payé deux fois', format('insert into payouts (tontine_id, round, member_id, amount, paid_on) select %L, 0, id, 1, current_date from members limit 1', current_setting('app.t')));
select pg_temp.check('organisateur modère le chat', (select count(*) from messages) = 2);
delete from messages where body = 'Bonjour';
select pg_temp.check('suppression par l''organisateur', (select count(*) from messages) = 1);

-- member reads payments, can close own topic, not touch payments
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check('membre lit les versements', (select count(*) from payments) = 1);
select pg_temp.zero('membre ne peut pas modifier un versement', $$with u as (update payments set amount = 1 returning 1) select count(*)::int from u$$);
update topics set closed = true;
select pg_temp.check('auteur clôt son sujet', (select closed from topics));
select pg_temp.fails('écrire dans un sujet clos', format('insert into messages (tontine_id, topic_id, author_name, body) select tontine_id, id, ''Bob'', ''encore'' from topics'));

-- outsider sees nothing
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.zero('intrus: tontines', $$select count(*)::int from tontines$$);
select pg_temp.zero('intrus: membres', $$select count(*)::int from members$$);
select pg_temp.zero('intrus: versements', $$select count(*)::int from payments$$);
select pg_temp.zero('intrus: messages', $$select count(*)::int from messages$$);
select pg_temp.fails('intrus: écrire un message', format('insert into messages (tontine_id, author_name, body) values (%L, ''X'', ''y'')', current_setting('app.t')));

-- push subscriptions: private to their owner
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into push_subscriptions (endpoint, p256dh, auth) values ('https://push.example/b', 'k', 'a') returning endpoint;
select pg_temp.check('abonnement push créé pour soi', (select count(*) from push_subscriptions) = 1);
select pg_temp.fails('abonnement push au nom d''un autre', $$insert into push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-0000-0000-00000000000a', 'https://push.example/x', 'k', 'a')$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.zero('abonnement push invisible pour les autres (même l''organisateur)', $$select count(*)::int from push_subscriptions$$);
select pg_temp.zero('abonnement push non supprimable par un autre', $$with d as (delete from push_subscriptions returning 1) select count(*)::int from d$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check('l''abonnement est toujours là', (select count(*) from push_subscriptions) = 1);
delete from push_subscriptions;
select pg_temp.zero('abonnement push supprimé par son propriétaire', $$select count(*)::int from push_subscriptions$$);

-- closing registrations blocks new requests
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update tontines set join_open = false;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.fails('inscriptions fermées', format('select join_tontine(%L, ''Dora'')', current_setting('app.code')));
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.fails('l''organisateur ne s''inscrit pas à sa propre tontine', format('select join_tontine(%L, ''Moi'')', current_setting('app.code')));

-- storage: path <tontine>/<user>/<file>
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
insert into storage.objects (bucket_id, name) values ('lisanga', current_setting('app.t') || '/00000000-0000-0000-0000-00000000000b/a.jpg');
select pg_temp.fails('fichier dans le dossier d''un autre', format('insert into storage.objects (bucket_id, name) values (''lisanga'', %L)', current_setting('app.t') || '/00000000-0000-0000-0000-00000000000a/a.jpg'));
select pg_temp.fails('chemin invalide', $$insert into storage.objects (bucket_id, name) values ('lisanga', 'pas-un-uuid/x/a.jpg')$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.zero('intrus ne lit pas les fichiers', $$select count(*)::int from storage.objects$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.check('organisateur lit les fichiers', (select count(*) from storage.objects) = 1);

-- co-organizer: only the creator names one; a co-organizer works like the creator except for naming and deleting the tontine
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.zero('membre ne se nomme pas organisateur', $$with u as (update members set is_organizer = true where user_id = '00000000-0000-0000-0000-00000000000b' returning 1) select count(*)::int from u$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
select pg_temp.fails('membre sans compte ne peut pas être organisateur', $$update members set is_organizer = true where name = 'Alice'$$);
update members set is_organizer = true where user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check('co-organisateur lit les téléphones', (select count(*) from contacts) >= 1);
update tontines set name = 'Tontine renommée';
select pg_temp.check('co-organisateur modifie les réglages', (select name from tontines) = 'Tontine renommée');
select pg_temp.fails('co-organisateur ne change pas le créateur', $$update tontines set owner_id = '00000000-0000-0000-0000-00000000000b'$$);
select pg_temp.zero('co-organisateur ne supprime pas la tontine', $$with d as (delete from tontines returning 1) select count(*)::int from d$$);
select pg_temp.fails('co-organisateur ne nomme personne', $$update members set is_organizer = true where name = 'Alice'$$);
select pg_temp.fails('co-organisateur ne se retire pas lui-même', $$update members set is_organizer = false where user_id = '00000000-0000-0000-0000-00000000000b'$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update members set is_organizer = false where user_id = '00000000-0000-0000-0000-00000000000b';
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.zero('ancien co-organisateur ne lit plus les téléphones', $$select count(*)::int from contacts$$);

-- link a new account to a member added by hand (what "C'est : Alice" does): remove the request, give the line the account
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.fails('inscriptions fermées pour le test de liaison', format('select join_tontine(%L, ''Dora'')', current_setting('app.code')));
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
update tontines set join_open = true;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select join_tontine(current_setting('app.code'), 'Dora');
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
delete from members where user_id = '00000000-0000-0000-0000-00000000000d' and status = 'pending';
update members set user_id = '00000000-0000-0000-0000-00000000000d' where name = 'Alice';
select pg_temp.check('la ligne d''Alice est reliée au compte', (select count(*) from members where name = 'Alice' and user_id = '00000000-0000-0000-0000-00000000000d' and status = 'active') = 1);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000d');
select pg_temp.check('le compte relié voit la tontine', (select count(*) from tontines) = 1);

-- journal: organizers write, active members read, nobody edits or deletes
reset role;
select pg_temp.as_user('00000000-0000-0000-0000-00000000000a');
insert into journal (tontine_id, by_name, text) values (current_setting('app.t')::uuid, 'Orga', 'Versement de 4 000 FC enregistré pour Alice');
select pg_temp.fails('journal: auteur imposé', format('insert into journal (tontine_id, by_id, by_name, text) values (%L, %L, ''Orga'', ''x'')', current_setting('app.t'), '00000000-0000-0000-0000-00000000000b'));
select pg_temp.fails('journal: pas de modification', $$update journal set text = 'autre'$$);
select pg_temp.fails('journal: pas de suppression', $$delete from journal$$);
select pg_temp.as_user('00000000-0000-0000-0000-00000000000b');
select pg_temp.check('journal: un membre actif le lit', (select count(*) from journal) = 1);
select pg_temp.fails('journal: un membre simple n''écrit pas', format('insert into journal (tontine_id, by_name, text) values (%L, ''Bob'', ''faux'')', current_setting('app.t')));
select pg_temp.as_user('00000000-0000-0000-0000-00000000000c');
select pg_temp.zero('journal: un intrus ne le lit pas', $$select count(*)::int from journal$$);
