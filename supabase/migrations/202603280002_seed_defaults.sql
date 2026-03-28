create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)))
  on conflict do nothing;

  insert into public.categories (user_id, name, sort_order)
  values
    (new.id, 'Uncategorized', 0),
    (new.id, 'Frontend', 1),
    (new.id, 'Design', 2),
    (new.id, 'Backend & DevOps', 3),
    (new.id, 'AI & ML', 4)
  on conflict do nothing;

  insert into public.user_preferences (user_id)
  values (new.id)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
