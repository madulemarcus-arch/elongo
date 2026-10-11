-- Comptes créés avec un numéro de téléphone (<chiffres>@tel.elongo.app) : ces adresses n'ont pas de boîte
-- e-mail, donc ils sont confirmés d'office. Les vraies adresses e-mail restent soumises au réglage
-- « Confirm email » de Supabase. À lancer une fois dans l'éditeur SQL (rejouable).
create or replace function public.confirm_phone_accounts() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email like '%@tel.elongo.app' and new.email_confirmed_at is null then new.email_confirmed_at := now(); end if;
  return new;
end $$;
revoke execute on function public.confirm_phone_accounts() from public, anon, authenticated;
drop trigger if exists confirm_phone_accounts on auth.users;
create trigger confirm_phone_accounts before insert on auth.users for each row execute function public.confirm_phone_accounts();
