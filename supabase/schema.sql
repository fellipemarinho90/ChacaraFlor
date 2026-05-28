-- Schema para o sistema de reservas Flor do Cerrado
-- Execute este SQL no SQL Editor do Supabase Dashboard

-- 1. Tabela de reservas
create table if not exists reservations (
  id uuid primary key default gen_random_uuid(),
  "clientName" text not null,
  phone text default '',
  cpf text default '',
  email text default '',
  "eventDate" date not null,
  "endDate" date not null,
  "eventType" text not null default 'Outro',
  status text not null default 'orcamento',
  "totalValue" numeric(10,2) default 0,
  "depositValue" numeric(10,2) default 0,
  payments jsonb default '[]'::jsonb,
  notes text default '',
  "paymentMethod" text default '',
  "createdAt" timestamptz default now(),
  "updatedAt" timestamptz default now()
);

-- 2. Tabela de configuracoes (uma unica linha)
create table if not exists settings (
  id integer primary key default 1,
  "employeeRate" numeric(10,2) default 260,
  constraint single_row check (id = 1)
);

-- 3. Inserir configuracao padrao
insert into settings (id, "employeeRate")
values (1, 260)
on conflict (id) do nothing;

-- 4. Indices para performance
create index if not exists idx_reservations_event_date on reservations ("eventDate");
create index if not exists idx_reservations_status on reservations (status);
create index if not exists idx_reservations_client_name on reservations ("clientName");

-- 5. Trigger para atualizar updatedAt automaticamente
create or replace function update_updated_at()
returns trigger as $$
begin
  new."updatedAt" = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_reservations_updated_at on reservations;
create trigger trigger_reservations_updated_at
  before update on reservations
  for each row
  execute function update_updated_at();
