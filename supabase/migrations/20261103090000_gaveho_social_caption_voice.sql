-- Per-account voice/brief for the AI caption generator (captions are always written as the account owner).
alter table public.gaveho_social_accounts add column if not exists caption_voice text
  check (caption_voice is null or char_length(caption_voice) <= 4000);

-- Seed voices (only when unset).
update public.gaveho_social_accounts set caption_voice = 'Cadenza (@cadenza.ops) is route-planning and scheduling software for pool service businesses. Write as the company ("we"), speaking directly to pool service owners and route managers: practical, confident, friendly, focused on saving drive time, keeping techs on schedule and growing routes. Use pool-industry hashtags (e.g. #poolservice #poolbusiness #poolcleaning #pooltech #poolroutes #smallbusiness). Always end with the CTA: Start free for 90 days. Link in bio.'
  where lower(username) = 'cadenza.ops' and caption_voice is null;
update public.gaveho_social_accounts set caption_voice = 'This is Gabriel Vega''s personal account (GAVEHO AI). Write as Gabriel in first person ("I"): a senior software engineer building AI products in public — sharing what I am building, shipping and learning with practical AI and dev tooling. Direct, warm, a bit playful, never corporate. Always spell GAVEHO with a V.'
  where lower(username) = 'gaveho_ai' and caption_voice is null;
