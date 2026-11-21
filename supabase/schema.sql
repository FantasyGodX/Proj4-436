-- Run this in the Supabase SQL Editor to create the quests table.
create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  status text not null default 'open'
    check (status in ('open', 'claimed', 'completed')),
  difficulty text not null default 'easy'
    check (difficulty in ('easy', 'medium', 'hard')),
  reward_gold integer not null default 0 check (reward_gold >= 0),
  claimed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only the server (service key) touches this table.
alter table public.quests enable row level security;

insert into public.quests (title, description, status, difficulty, reward_gold, claimed_by) values
  ('Slay the Cellar Rats', 'The tavern cellar is overrun. Clear it out.', 'open', 'easy', 25, null),
  ('Escort the Merchant', 'Guard a spice merchant on the road to Eldermoor.', 'claimed', 'medium', 120, 'Aria'),
  ('Retrieve the Lost Amulet', 'An amulet was lost in the Whispering Caves.', 'open', 'hard', 300, null),
  ('Deliver the Royal Letter', 'Carry a sealed letter to the northern keep.', 'completed', 'easy', 40, 'Borin');
