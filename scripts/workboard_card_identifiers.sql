-- Add sequential, human-readable identifiers to workboard cards

create sequence if not exists public.workboard_card_seq;

alter table public.workboard_cards
  add column if not exists card_number bigint;

alter table public.workboard_cards
  alter column card_number set default nextval('public.workboard_card_seq');

update public.workboard_cards
  set card_number = nextval('public.workboard_card_seq')
  where card_number is null;

alter table public.workboard_cards
  add column if not exists card_reference text generated always as ('MOVRR-' || card_number) stored;

create unique index if not exists workboard_cards_card_reference_key
  on public.workboard_cards (card_reference);

alter table public.workboard_cards
  alter column card_number set not null;

select setval(
  'public.workboard_card_seq',
  (select coalesce(max(card_number), 0) from public.workboard_cards)
);
