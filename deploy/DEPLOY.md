# PTFv2 Deployment Guide

Target: Ubuntu server with Apache2 + HTTPS (Let's Encrypt) already configured.
Domain: charlization.com
Game URL: https://charlization.com/ptf/

---

## Part 1: Deploy PTFv2 (required)

### Step 1: Enable Apache proxy modules (one-time)

```bash
sudo a2enmod proxy proxy_http proxy_wstunnel
```

### Step 2: Add PTFv2 proxy rules to Apache

Find your HTTPS virtual host config:
```bash
# See which configs are active:
ls /etc/apache2/sites-enabled/

# Likely one of:
#   /etc/apache2/sites-available/000-default-le-ssl.conf
#   /etc/apache2/sites-available/default-ssl.conf
#   /etc/apache2/sites-available/charlization.com-le-ssl.conf
```

Edit that file:
```bash
sudo nano /etc/apache2/sites-available/YOUR-SSL-CONFIG.conf
```

Add these lines INSIDE the `<VirtualHost *:443>` block, before `</VirtualHost>`:
```apache
    # ── PTFv2 Game (port 8080) ──
    # WebSocket proxy (MUST come before the HTTP proxy)
    ProxyPass /ptf/ws ws://127.0.0.1:8080/ws
    ProxyPassReverse /ptf/ws ws://127.0.0.1:8080/ws

    # HTTP proxy for static files and API
    ProxyPass /ptf/ http://127.0.0.1:8080/
    ProxyPassReverse /ptf/ http://127.0.0.1:8080/
```

Test config and restart:
```bash
sudo apache2ctl configtest
sudo systemctl restart apache2
```

If configtest shows "Syntax OK", you're good. If it shows errors, fix them
before restarting.

### Step 3: Clone and set up PTFv2

```bash
cd /opt
sudo mkdir -p ptfv2
sudo chown $USER:$USER ptfv2
git clone https://github.com/YOUR_USERNAME/PTFv2.git ptfv2
cd ptfv2
npm install
```

### Step 4: Build the client

```bash
npm run build
```

This creates `client/dist/` with the production client files.

### Step 5: Install pm2 and start the server

```bash
sudo npm install -g pm2

# Start the game server
pm2 start server/src/main.js --name ptfv2

# Make it survive reboots
pm2 save
pm2 startup
# (follow the command pm2 prints — it will ask you to copy/paste a sudo line)
```

### Step 6: Test it

Open https://charlization.com/ptf/ in your browser.
You should see the game. Open a second tab to test multiplayer.

### Useful pm2 commands

```bash
pm2 status          # Check if running
pm2 logs ptfv2      # See server logs (Ctrl+C to exit)
pm2 restart ptfv2   # Restart after code changes
pm2 stop ptfv2      # Stop the server
```

### Updating after code changes

```bash
cd /opt/ptfv2
git pull
npm install          # In case dependencies changed
npm run build        # Rebuild client
pm2 restart ptfv2    # Restart server
```

---

## Part 2: Migrate existing apps behind Apache (optional)

Your apps on ports 3000 and 4000 currently handle their own SSL, which
causes "not secure" browser warnings (likely self-signed certs). By routing
them through Apache instead, they get the valid Let's Encrypt cert for free
and you get clean URLs.

This is completely independent of the PTFv2 deployment. Do it whenever
you're ready, or skip it entirely.

### What changes

```
BEFORE:
  https://charlization.com:3000  → app handles its own SSL (cert warnings)
  https://charlization.com:4000  → app handles its own SSL (cert warnings)

AFTER:
  https://charlization.com/app/     → Apache proxies to localhost:3000
  https://charlization.com/canvas/  → Apache proxies to localhost:4000
  (ports 3000/4000 no longer need to be open to the internet)
```

### Step 1: Add proxy rules to Apache

Edit the same SSL config file from Part 1. Add these lines in the
`<VirtualHost *:443>` block alongside the PTFv2 rules:

```apache
    # ── Login/Web App (port 3000) ──
    # If the app uses WebSockets, add a WS proxy line too
    ProxyPass /app/ http://127.0.0.1:3000/
    ProxyPassReverse /app/ http://127.0.0.1:3000/

    # ── Charlization Canvas Game (port 4000) ──
    # If the app uses WebSockets, add a WS proxy line too
    ProxyPass /canvas/ http://127.0.0.1:4000/
    ProxyPassReverse /canvas/ http://127.0.0.1:4000/
```

Test and restart:
```bash
sudo apache2ctl configtest
sudo systemctl restart apache2
```

### Step 2: Reconfigure the apps to run HTTP-only on localhost

Each app currently handles its own HTTPS. Since Apache now terminates SSL,
the apps should switch to plain HTTP. This depends on each app's config:

For the port 3000 app:
  - Find where it configures HTTPS (likely reads cert/key files)
  - Change it to HTTP-only on port 3000
  - Make sure it binds to 127.0.0.1 (localhost only), not 0.0.0.0

For the port 4000 canvas game:
  - Same thing: switch to HTTP, bind to 127.0.0.1

IMPORTANT: Don't do this step until the Apache proxy is working, or
you'll lose access to the apps.

### Step 3: Close the ports in your firewall (optional, recommended)

Once the apps are accessible through Apache, you no longer need ports
3000 and 4000 open to the internet:

```bash
# If using ufw:
sudo ufw deny 3000
sudo ufw deny 4000

# Verify:
sudo ufw status
```

Port 8080 (PTFv2) also doesn't need to be open since Apache proxies it.
Only ports 80 (HTTP) and 443 (HTTPS) need to be open for Apache.

### Step 4: Update any bookmarks or links

The old URLs (charlization.com:3000, charlization.com:4000) will stop
working once you close the ports. Update any bookmarks to:
  - https://charlization.com/app/
  - https://charlization.com/canvas/

### Notes on subpath routing

Some apps don't work well behind a subpath because they generate absolute
URLs (e.g. redirecting to `/auth/login` instead of `/app/auth/login`).
If you hit issues after proxying:

Option A: Configure the app's "base URL" or "prefix" setting (most
  frameworks have this — Express, Next.js, etc.)

Option B: Use a subdomain instead of a subpath:
  ```apache
  # In a separate <VirtualHost *:443> block for app.charlization.com:
  ProxyPass / http://127.0.0.1:3000/
  ProxyPassReverse / http://127.0.0.1:3000/
  ```
  This avoids subpath issues entirely but requires a DNS record and
  separate SSL cert (certbot can handle this).

Option C: Leave the app on its port and just fix its SSL cert by
  pointing it to the Let's Encrypt cert files that Apache uses:
  ```
  /etc/letsencrypt/live/charlization.com/fullchain.pem
  /etc/letsencrypt/live/charlization.com/privkey.pem
  ```
  This is the quickest fix for the "not secure" warning without
  changing URLs.
