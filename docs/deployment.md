# Deployment — Oracle Cloud Always Free ARM VM

Runbook for running CultBot unattended 24/7. Written for Oracle's Always Free
Ampere A1 tier (Ubuntu, arm64), but only Phases 1–3 are Oracle-specific.

## Topology

- **Bot:** a single Docker container on the VM, `restart: unless-stopped`.
- **Database:** external — Neon serverless Postgres, via `DATABASE_URL` in `.env`.
  Compose deliberately does **not** override `DATABASE_URL`; an override would
  point the deployed bot at a different database than it was developed against,
  and it would come up healthy against an empty schema with every user's XP and
  todos apparently gone.
- **Inbound ports: none.** The bot is a pure outbound WebSocket + REST client.
  No reverse proxy, no domain, no TLS, no open ingress beyond SSH.

Because Neon auto-suspends on idle, `src/cron/dbKeepAlive.ts` keeps the
connection warm and `DATABASE_URL` carries raised `connect_timeout` /
`pool_timeout` values. Do not strip those.

### ARM compatibility

Verified before deploying:
- `package-lock.json` pins `@napi-rs/canvas-linux-arm64-musl`, so canvas installs
  a prebuilt binary rather than compiling from source on Alpine ARM64.
- `prisma/schema.prisma` sets no `binaryTargets`, so Prisma generates engines for
  whatever platform runs `prisma generate`. **Build on the VM.** Cross-building
  from an x64/darwin machine produces the wrong engines.

---

## Phase 1 — Provision the VM

**Expect `Out of host capacity` on Ampere A1.** It is the most common failure,
it is per-region and per-availability-domain, and it is not a mistake on your
part. Workarounds, most effective first:

1. **Upgrade to Pay As You Go.** By far the biggest lever — PAYG requests are
   served from a higher-priority pool. Always Free resources remain free; set a
   $0 budget alert.
2. Retry on a loop via the OCI CLI, ~60s apart. Faster is rate-limited and does
   not help.
3. Try every availability domain in the region.
4. Ask for less: 1 OCPU / 6 GB succeeds far more often than 4 / 24, and the shape
   can be resized later with a stop/start.

Your home region is fixed at signup and cannot be changed.

Settings:
- **Image:** Canonical Ubuntu 22.04 (aarch64).
- **Shape:** `VM.Standard.A1.Flex` — 4 OCPU / 24 GB is the entire free ARM
  allowance.
- **Boot volume:** 100 GB (free tier allows 200 GB total).
- **SSH key:** generate locally first and paste the public key at creation time;
  Oracle's Ubuntu images have no password fallback.

```bash
ssh-keygen -t ed25519 -C "cultbot-oracle" -f ~/.ssh/oracle_cultbot
pbcopy < ~/.ssh/oracle_cultbot.pub
```

Login user is `ubuntu`. **Reserve the public IP immediately** — Instance →
Attached VNICs → IPv4 Addresses → Edit → Reserved. The ephemeral address is lost
on stop/start.

---

## Phase 2 — SSH and hardening

```bash
chmod 600 ~/.ssh/oracle_cultbot
ssh -i ~/.ssh/oracle_cultbot ubuntu@<PUBLIC_IP>
```

`~/.ssh/config` on the workstation:

```
Host cultbot
  HostName <RESERVED_IP>
  User ubuntu
  IdentityFile ~/.ssh/oracle_cultbot
  IdentitiesOnly yes
  ServerAliveInterval 60
```

### Two firewalls, not one

Traffic must pass **both** the Oracle Security List (cloud-side, in the VCN) and
the instance's own iptables. Oracle's Ubuntu images ship a populated
`/etc/iptables/rules.v4` managed by `netfilter-persistent` that ends in a
`REJECT all` rule. This is why "I opened the port in the console and it still
doesn't work" is the most common Oracle question.

For this bot that is a feature — it needs no inbound ports:

- Leave only the default `22/tcp` ingress in the Security List. Open nothing else.
- **Do not install ufw.** Layering it over Oracle's existing rules produces two
  independent rule sets and commonly locks people out of SSH with no recovery
  path. Oracle's defaults already do what is wanted here.

Inspect with `sudo iptables -L INPUT -n --line-numbers`.

### sshd

```bash
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo sed -i 's/^#\?PermitRootLogin.*/PermitRootLogin no/' /etc/ssh/sshd_config
```

On Ubuntu 22.04+, files in `/etc/ssh/sshd_config.d/` are `Include`d first and
win, and Oracle drops one there. Always verify:

```bash
sudo grep -rE 'PasswordAuthentication|PermitRootLogin' /etc/ssh/sshd_config.d/ /etc/ssh/sshd_config
sudo sshd -t && sudo systemctl restart ssh
```

Keep the current session open and confirm from a second terminal before closing it.

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y fail2ban unattended-upgrades
printf '[sshd]\nenabled = true\nmaxretry = 4\nbantime = 1h\n' | sudo tee /etc/fail2ban/jail.local
sudo systemctl enable --now fail2ban
sudo dpkg-reconfigure -plow unattended-upgrades
```

Do **not** enable `Unattended-Upgrade::Automatic-Reboot`. An unattended reboot
mid-migration is the scenario the graceful-shutdown handler exists to avoid.

---

## Phase 3 — Docker on ARM64

Use the official Docker apt repo — `apt install docker.io` ships an old engine
and no compose plugin. Note `arch=arm64`:

```bash
sudo apt install -y ca-certificates curl gnupg
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=arm64 signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo $VERSION_CODENAME) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo usermod -aG docker $USER && newgrp docker
sudo systemctl enable --now docker containerd
systemctl is-enabled docker    # MUST print "enabled"
docker compose version
```

`systemctl is-enabled docker` is non-negotiable. If the daemon is not enabled at
boot, `restart: unless-stopped` means nothing and the bot silently never returns
after a reboot — the most common "it died and I didn't notice" cause.

---

## Phase 4 — Clone the private repo

Use a **read-only deploy key**: scoped to this repo alone, revocable from the
repo's own settings, no expiry churn, and the private key never leaves the VM.
(A PAT is account-scoped, expires silently months later, and ends up in plaintext
in `~/.git-credentials` or baked into `.git/config`.)

```bash
# on the VM
ssh-keygen -t ed25519 -C "cultbot-deploy" -f ~/.ssh/gh_deploy -N ""
cat ~/.ssh/gh_deploy.pub
```

Add that key at GitHub → repo → Settings → Deploy keys → **leave "Allow write
access" unchecked**.

```bash
cat >> ~/.ssh/config <<'EOF'
Host github.com
  IdentityFile ~/.ssh/gh_deploy
  IdentitiesOnly yes
EOF
chmod 600 ~/.ssh/config
ssh -T git@github.com          # expect "successfully authenticated"
git clone git@github.com:<owner>/<repo>.git ~/cultbot
```

---

## Phase 5 — `.env` onto the VM

`.env` is gitignored and must be transferred out of band.

```bash
# from the workstation, repo root
scp .env cultbot:~/cultbot/.env
# on the VM
chmod 600 ~/cultbot/.env && ls -l ~/cultbot/.env    # -rw-------
```

Required: `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `DATABASE_URL` (the Neon URL,
including its `connect_timeout` / `pool_timeout` parameters).

Recommended: `GITHUB_TOKEN` — the GitHub poller runs every 2 minutes and
unauthenticated REST is capped at 60 requests/hour, so the integration is
effectively dead without it.

Leave unset: `BOT_ICON_URL` (the footer icon falls back to the bot's
Discord-hosted avatar) and `AUTO_SET_AVATAR` (`src/assets/` is not copied into
the runtime image, so it cannot work in Docker — upload the icon via the
Developer Portal instead).

---

## Phase 6 — First run

```bash
cd ~/cultbot
docker compose build      # separately, so build errors are readable
docker compose up -d
docker compose logs -f
```

Expect **6–14 minutes** for a cold build on 4 Ampere cores; 25–40 minutes on a
1 OCPU shape — use `tmux` so an SSH drop doesn't kill it. The two
`npx prisma generate` runs are the slowest steps and are network-bound.

Troubleshooting:
- node-gyp / cairo errors → the lockfile lost its ARM optional dependency.
  Regenerate the lockfile; do not install build tools.
- `Unable to require libquery_engine` → musl/OpenSSL mismatch. Add
  `binaryTargets = ["native", "linux-musl-arm64-openssl-3.0.x"]` to
  `schema.prisma` rather than switching base images.

### Verify

```bash
docker compose ps
docker compose exec bot npx prisma migrate status
docker compose logs bot | grep -iE "bot ready|error"
```

Any migration showing `finished_at IS NULL` indicates an interrupted migration;
resolve it with `prisma migrate resolve` before continuing.

### Register slash commands

```bash
docker compose run --rm bot node dist/deploy-commands.js
```

Global registration takes up to an hour to propagate.

Confirm **Server Members Intent** is enabled in the Developer Portal (Bot →
Privileged Gateway Intents). `src/index.ts` requests `GuildMembers`; without it
`client.login` throws `Used disallowed intents` and the container restart-loops.

---

## Phase 7 — Logs and health

```bash
docker compose logs -f --tail=100 bot
docker compose logs --since 10m bot
docker inspect -f '{{.RestartCount}} {{.State.Status}}' $(docker compose ps -q bot)
sudo journalctl -u docker -n 100 --no-pager
```

There is no HTTP health endpoint (adding one would mean opening a port), so
health is inferred from container state plus recent errors:

```bash
docker compose ps --format '{{.Service}} {{.State}}' && \
docker compose logs --since 5m bot 2>&1 | grep -ciE 'error|fatal|ECONNREFUSED'
```

Optional Discord-webhook alert via cron. Note it only catches "container not
running" — a process that is alive but disconnected from the gateway will not
trigger it:

```
*/10 * * * * cd /home/ubuntu/cultbot && [ "$(docker compose ps -q bot | xargs -r docker inspect -f '{{.State.Running}}')" = "true" ] || curl -s -X POST -H 'Content-Type: application/json' -d '{"content":"CultBot is DOWN"}' <WEBHOOK_URL>
```

Log growth is bounded by the `logging` block in `docker-compose.yml`
(10 MB × 3 files per service). Without it, seven cron jobs on 60s–15min
intervals fill the boot volume on a real timeline.

---

## Phase 8 — Reboot test

Do not consider the deployment done until this passes. It is the step that
proves the entire exercise.

```bash
sudo reboot
# wait ~45s
ssh cultbot
systemctl is-enabled docker && systemctl is-active docker
cd ~/cultbot && docker compose ps
docker compose logs --tail=50 bot
```

Expected: the container is `Up` and `migrate deploy` reports no pending
migrations. An empty `docker compose ps` means `docker.service` was never
enabled at boot.

---

## Phase 9 — Swap

Not needed on 24 GB — runtime footprint is roughly 150–300 MB for Node, and with
an external database there is no Postgres process on the box at all.

On a smaller shape, add 2 GB as build insurance (the build, not the runtime, is
the memory peak):

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf
```

---

## Redeploy

```bash
ssh cultbot
cd ~/cultbot && git pull && docker compose up -d --build
# only when a command definition changed:
docker compose run --rm bot node dist/deploy-commands.js
```

## Secret handling

Never run `docker compose config` on a shared terminal or paste its output
anywhere — it interpolates `env_file` values and prints `DISCORD_TOKEN` and the
full `DATABASE_URL` in clear text. Use `docker compose config --services` or
`--quiet` to validate without rendering secrets.
