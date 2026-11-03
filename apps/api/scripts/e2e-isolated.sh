#!/usr/bin/env bash
# Roda os e2e da API em PostgreSQL/PostGIS e Mailpit descartáveis, nunca no banco de dev/teste.
#
# - containers com --rm e dados em tmpfs, portas efêmeras só em 127.0.0.1;
# - usuário, senha e banco aleatórios;
# - o banco recebe um token aleatório (tabela e2e_isolation) e o system_identifier do cluster é
#   capturado: o global-setup e os specs de corrida recusam rodar se não baterem;
# - os containers são removidos ao sair, inclusive em erro ou Ctrl+C.
#
# Uso (de qualquer diretório):
#   apps/api/scripts/e2e-isolated.sh [args do jest]          jest direto (um spec, depuração)
#   apps/api/scripts/e2e-isolated.sh test/moderation-race.e2e-spec.ts
#   apps/api/scripts/e2e-isolated.sh --turbo [args do jest]  caminho do CI (`pnpm test:e2e:ci`):
#     `pnpm turbo test:e2e` na raiz com E2E_REQUIRE_RACE=1 e relatório JSON do Jest, verificado
#     depois por scripts/verify-e2e-report.mjs (fora da tarefa do turbo). E2E_REPORT_FILE escolhe
#     onde gravar o relatório.
set -euo pipefail
cd "$(dirname "$0")/.."

mode=jest
if [ "${1:-}" = "--turbo" ]; then mode=turbo; shift; fi

PG_IMAGE="postgis/postgis:16-3.4"
MAIL_IMAGE="axllent/mailpit:v1.27"

rand() { node -e "process.stdout.write(require('node:crypto').randomBytes($1).toString('hex'))"; }

suffix="$(rand 4)"
pg="aqp-e2e-pg-$suffix"
mail="aqp-e2e-mail-$suffix"
user="e2e_$(rand 3)"
password="$(rand 16)"
db="e2e_$(rand 4)"
token="$(rand 16)"

cleanup() { docker rm -f "$pg" "$mail" >/dev/null 2>&1 || true; }
trap cleanup EXIT INT TERM

docker run -d --rm --name "$pg" \
  --tmpfs /var/lib/postgresql/data:rw \
  -e POSTGRES_USER="$user" -e POSTGRES_PASSWORD="$password" -e POSTGRES_DB="$db" \
  -p 127.0.0.1::5432 "$PG_IMAGE" >/dev/null
docker run -d --rm --name "$mail" -p 127.0.0.1::1025 -p 127.0.0.1::8025 "$MAIL_IMAGE" >/dev/null

port_of() { docker port "$1" "$2/tcp" | head -1 | sed 's/.*://'; }
pg_port="$(port_of "$pg" 5432)"
smtp_port="$(port_of "$mail" 1025)"
web_port="$(port_of "$mail" 8025)"

# Por TCP: durante a inicialização o servidor temporário do entrypoint só escuta no socket.
for attempt in $(seq 1 60); do
  if docker exec "$pg" pg_isready -q -h 127.0.0.1 -U "$user" -d "$db"; then break; fi
  if [ "$attempt" = 60 ]; then echo "PostgreSQL não ficou pronto" >&2; exit 1; fi
  sleep 1
done
for attempt in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$web_port/api/v1/info" >/dev/null 2>&1; then break; fi
  if [ "$attempt" = 30 ]; then echo "Mailpit não ficou pronto" >&2; exit 1; fi
  sleep 1
done

psql_c() { docker exec "$pg" psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -U "$user" -d "$db" -tAc "$1"; }
psql_c "CREATE TABLE e2e_isolation (token text NOT NULL); INSERT INTO e2e_isolation VALUES ('$token')" >/dev/null
system_id="$(psql_c "SELECT system_identifier FROM pg_control_system()")"

export E2E_ISOLATED=1
export E2E_ISOLATION_TOKEN="$token"
export E2E_PG_SYSTEM_ID="$system_id"
export DATABASE_URL="postgresql://$user:$password@127.0.0.1:$pg_port/$db"
export SMTP_URL="smtp://127.0.0.1:$smtp_port"
export MAILPIT_URL="http://127.0.0.1:$web_port"

echo "e2e isolado: postgres 127.0.0.1:$pg_port ($pg), mailpit 127.0.0.1:$web_port ($mail)"
if [ "$mode" = jest ]; then
  node --experimental-vm-modules node_modules/jest/bin/jest.js \
    --config ./test/jest-e2e.json --runInBand "$@"
  exit
fi

export E2E_REQUIRE_RACE=1
report="${E2E_REPORT_FILE:-$(mktemp -d)/jest-e2e.json}"
rm -f "$report"
started="$(node -e "process.stdout.write(String(Date.now()))")"
status=0
(cd ../.. && pnpm turbo test:e2e -- --json --outputFile="$report" "$@") || status=$?
echo "relatório do Jest: $report"
# Roda mesmo com o turbo reprovado, para o log dizer quais specs protegidos faltaram ou falharam.
node scripts/verify-e2e-report.mjs "$report" "$started" || status=1
exit "$status"
