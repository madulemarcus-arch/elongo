-- Appels vocaux : la signalisation passe par un canal Realtime « broadcast » privé par tontine (nom : call:<id de la tontine>).
-- Ces règles réservent le canal aux membres actifs de la tontine (organisateurs compris). À lancer une fois dans l'éditeur SQL
-- de Supabase (rejouable). Elles ne concernent que les canaux privés : les autres abonnements temps réel ne changent pas.
-- Sans elles, l'appli affiche « les appels ne sont pas disponibles ».
drop policy if exists call_signal_read on realtime.messages;
drop policy if exists call_signal_write on realtime.messages;
create policy call_signal_read on realtime.messages for select to authenticated
  using (realtime.messages.extension = 'broadcast' and (select realtime.topic()) like 'call:%'
         and public.is_active(public.try_uuid(split_part((select realtime.topic()), ':', 2))));
create policy call_signal_write on realtime.messages for insert to authenticated
  with check (realtime.messages.extension = 'broadcast' and (select realtime.topic()) like 'call:%'
         and public.is_active(public.try_uuid(split_part((select realtime.topic()), ':', 2))));
