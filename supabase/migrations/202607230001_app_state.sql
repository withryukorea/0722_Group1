-- 해커톤 MVP 영구 저장소
-- 기존 server/store.js의 상태 계약을 JSONB로 보존하고 영수증 이미지는 비공개 Storage에 둔다.
create table if not exists public.app_state (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

insert into public.app_state (id, data)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'receipt-images',
  'receipt-images',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- RLS 정책은 의도적으로 만들지 않는다.
-- 브라우저가 Supabase를 직접 호출하지 않고 Render 서버의 sb_secret 키만 접근한다.
