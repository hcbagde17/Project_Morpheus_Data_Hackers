-- ============================================================================
-- BLACKLIST MIGRATION FOR PROCTORWATCH
-- Run in Supabase SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. CREATE TABLE: app_blacklist
--    Stores every known app with its category and default blocked state.
--    Both the admin and technical roles can manage this table.
-- ============================================================================
CREATE TABLE IF NOT EXISTS app_blacklist (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  process_name  TEXT NOT NULL UNIQUE,          -- e.g. 'chrome.exe'
  display_name  TEXT NOT NULL,                 -- e.g. 'Chrome'
  category      TEXT NOT NULL,                 -- e.g. 'browsers'
  is_default    BOOLEAN DEFAULT true,          -- false = admin-added custom app
  is_whitelisted BOOLEAN DEFAULT false,        -- true = allowed despite being in list
  added_by      UUID REFERENCES users(id),     -- NULL for seed defaults
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups during enforcement
CREATE INDEX IF NOT EXISTS idx_blacklist_process  ON app_blacklist(process_name);
CREATE INDEX IF NOT EXISTS idx_blacklist_category ON app_blacklist(category);
CREATE INDEX IF NOT EXISTS idx_blacklist_whitelist ON app_blacklist(is_whitelisted);

-- Enable RLS
ALTER TABLE app_blacklist ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for authenticated" ON app_blacklist FOR ALL USING (true);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_app_blacklist_updated_at
  BEFORE UPDATE ON app_blacklist
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- 2. SEED DATA — Full 150+ app list seeded into the table
-- ============================================================================

INSERT INTO app_blacklist (process_name, display_name, category, is_default) VALUES
-- Remote Desktop & Access
('mstsc.exe',          'Remote Desktop Connection', 'remote',        true),
('rdpclip.exe',        'RDP Clipboard Monitor',     'remote',        true),
('teamviewer.exe',     'TeamViewer',                'remote',        true),
('anydesk.exe',        'AnyDesk',                   'remote',        true),
('vncviewer.exe',      'VNC Viewer',                'remote',        true),
('remotepc.exe',       'RemotePC',                  'remote',        true),

-- Screen Recording & Capture
('obs64.exe',                  'OBS Studio (64-bit)',          'recording', true),
('obs32.exe',                  'OBS Studio (32-bit)',          'recording', true),
('sharex.exe',                 'ShareX',                       'recording', true),
('bandicam.exe',               'Bandicam',                     'recording', true),
('camtasia.exe',               'Camtasia',                     'recording', true),
('camrecorder.exe',            'Cam Recorder',                 'recording', true),
('snagit.exe',                 'Snagit',                       'recording', true),
('snagiteditor.exe',           'Snagit Editor',                'recording', true),
('lightshot.exe',              'Lightshot',                    'recording', true),
('greenshot.exe',              'Greenshot',                    'recording', true),
('gyazo.exe',                  'Gyazo',                        'recording', true),
('loom.exe',                   'Loom',                         'recording', true),
('icecreamscreenrecorder.exe', 'Icecream Screen Recorder',     'recording', true),
('action.exe',                 'Mirillis Action!',             'recording', true),
('fraps.exe',                  'Fraps',                        'recording', true),
('d3dgear.exe',                'D3DGear',                      'recording', true),
('hypercam.exe',               'HyperCam',                     'recording', true),
('xnview.exe',                 'XnView',                       'recording', true),
('picpick.exe',                'PicPick',                      'recording', true),
('winsnap.exe',                'WinSnap',                      'recording', true),

-- Virtual Machines & Emulation
('vmware.exe',              'VMware Workstation',  'virtual_machine', true),
('vmtoolsd.exe',            'VMware Tools',        'virtual_machine', true),
('vmware-vmx.exe',          'VMware VMX',          'virtual_machine', true),
('virtualbox.exe',          'VirtualBox',          'virtual_machine', true),
('vboxservice.exe',         'VirtualBox Service',  'virtual_machine', true),
('vboxheadless.exe',        'VirtualBox Headless', 'virtual_machine', true),
('prl_cc.exe',              'Parallels Desktop',   'virtual_machine', true),
('prl_tools.exe',           'Parallels Tools',     'virtual_machine', true),
('qemu-system-x86_64.exe',  'QEMU (x86_64)',        'virtual_machine', true),
('qemu-system-i386.exe',    'QEMU (i386)',          'virtual_machine', true),
('dosbox.exe',              'DOSBox',              'virtual_machine', true),
('bluestacks.exe',          'BlueStacks',          'virtual_machine', true),
('nox.exe',                 'Nox Player',          'virtual_machine', true),
('memu.exe',                'MEmu Play',           'virtual_machine', true),
('ldplayer.exe',            'LDPlayer',            'virtual_machine', true),

-- Communication & Social
('slack.exe',           'Slack',              'communication', true),
('teams.exe',           'Microsoft Teams',    'communication', true),
('ms-teams.exe',        'MS Teams',           'communication', true),
('msteams.exe',         'MS Teams (Alt)',      'communication', true),
('skype.exe',           'Skype',              'communication', true),
('zoom.exe',            'Zoom',               'communication', true),
('discord.exe',         'Discord',            'communication', true),
('discordcanary.exe',   'Discord Canary',     'communication', true),
('discordptb.exe',      'Discord PTB',        'communication', true),
('whatsapp.exe',        'WhatsApp',           'communication', true),
('whatsappdesktop.exe', 'WhatsApp Desktop',   'communication', true),
('telegram.exe',        'Telegram',           'communication', true),
('instagram.exe',       'Instagram',          'communication', true),
('snapchat.exe',        'Snapchat',           'communication', true),
('signal.exe',          'Signal',             'communication', true),
('viber.exe',           'Viber',              'communication', true),
('wechat.exe',          'WeChat',             'communication', true),
('line.exe',            'LINE',               'communication', true),
('element.exe',         'Element (Matrix)',   'communication', true),
('mattermost.exe',      'Mattermost',         'communication', true),
('rocketchat.exe',      'Rocket.Chat',        'communication', true),
('thunderbird.exe',     'Thunderbird',        'communication', true),
('outlook.exe',         'Outlook',            'communication', true),

-- AI Assistants & Notes
('chatgpt.exe',   'ChatGPT',       'ai_notes', true),
('claude.exe',    'Claude',        'ai_notes', true),
('notion.exe',    'Notion',        'ai_notes', true),
('onenote.exe',   'OneNote',       'ai_notes', true),
('onenotem.exe',  'OneNote (M)',   'ai_notes', true),
('evernote.exe',  'Evernote',      'ai_notes', true),
('obsidian.exe',  'Obsidian',      'ai_notes', true),
('stikynot.exe',  'Sticky Notes',  'ai_notes', true),
('cortana.exe',   'Cortana',       'ai_notes', true),
('bingchat.exe',  'Bing Chat',     'ai_notes', true),
('joplin.exe',    'Joplin',        'ai_notes', true),
('roam.exe',      'Roam Research', 'ai_notes', true),

-- Web Browsers
('chrome.exe',       'Google Chrome',    'browsers', true),
('firefox.exe',      'Firefox',          'browsers', true),
('msedge.exe',       'Microsoft Edge',   'browsers', true),
('msedge_proxy.exe', 'Edge Proxy',       'browsers', true),
('safari.exe',       'Safari',           'browsers', true),
('opera.exe',        'Opera',            'browsers', true),
('brave.exe',        'Brave',            'browsers', true),
('vivaldi.exe',      'Vivaldi',          'browsers', true),
('tor.exe',          'Tor Browser',      'browsers', true),
('arc.exe',          'Arc Browser',      'browsers', true),
('chromium.exe',     'Chromium',         'browsers', true),
('waterfox.exe',     'Waterfox',         'browsers', true),
('palemoon.exe',     'Pale Moon',        'browsers', true),
('maxthon.exe',      'Maxthon',          'browsers', true),
('ucbrowser.exe',    'UC Browser',       'browsers', true),
('browser.exe',      'Yandex Browser',   'browsers', true),
('iexplore.exe',     'Internet Explorer','browsers', true),
('epiphany.exe',     'GNOME Web',        'browsers', true),
('midori.exe',       'Midori',           'browsers', true),

-- VPN & Tunneling
('nordvpn.exe',        'NordVPN',          'vpn', true),
('nordvpn-service.exe','NordVPN Service',  'vpn', true),
('expressvpn.exe',     'ExpressVPN',       'vpn', true),
('expressvpnd.exe',    'ExpressVPN Daemon','vpn', true),
('surfshark.exe',      'Surfshark',        'vpn', true),
('protonvpn.exe',      'ProtonVPN',        'vpn', true),
('cyberghostvpn.exe',  'CyberGhost VPN',   'vpn', true),
('pia-client.exe',     'PIA VPN',          'vpn', true),
('ipvanish.exe',       'IPVanish',         'vpn', true),
('windscribe.exe',     'Windscribe',       'vpn', true),
('tunnelbear.exe',     'TunnelBear',       'vpn', true),
('hss-update.exe',     'Hotspot Shield',   'vpn', true),
('mullvad-vpn.exe',    'Mullvad VPN',      'vpn', true),
('atlasvpn.exe',       'Atlas VPN',        'vpn', true),
('hide.me.exe',        'hide.me VPN',      'vpn', true),
('purevpn.exe',        'PureVPN',          'vpn', true),
('vyprvpn.exe',        'VyprVPN',          'vpn', true),
('openvpn.exe',        'OpenVPN',          'vpn', true),
('openvpn-gui.exe',    'OpenVPN GUI',      'vpn', true),
('wireguard.exe',      'WireGuard',        'vpn', true),

-- Gaming Overlays & Launchers
('steam.exe',            'Steam',              'gaming', true),
('steamservice.exe',     'Steam Service',      'gaming', true),
('epicgameslauncher.exe','Epic Games Launcher','gaming', true),
('origin.exe',           'EA Origin',          'gaming', true),
('battle.net.exe',       'Battle.net',         'gaming', true),
('gamebar.exe',          'Xbox Game Bar',       'gaming', true),
('nvidia share.exe',     'NVIDIA Share',       'gaming', true),
('nvspcaps64.exe',       'GeForce Overlay',    'gaming', true),
('overwolf.exe',         'Overwolf',           'gaming', true),
('discord_overlay.exe',  'Discord Overlay',    'gaming', true),

-- System Tools / Process Evasion
('taskmgr.exe',              'Task Manager',      'system', true),
('procexp.exe',              'Process Explorer',  'system', true),
('procexp64.exe',            'Process Explorer 64','system', true),
('procmon.exe',              'Process Monitor',   'system', true),
('wireshark.exe',            'Wireshark',         'system', true),
('fiddler.exe',              'Fiddler',           'system', true),
('charles.exe',              'Charles Proxy',     'system', true),
('cheatengine-x86_64.exe',   'Cheat Engine 64',   'system', true),
('cheatengine-i386.exe',     'Cheat Engine 32',   'system', true),
('sandboxy.exe',             'Sandboxie',         'system', true),
('sandboxie-plus.exe',       'Sandboxie Plus',    'system', true),

-- Programming Tools
('python.exe',        'Python',           'programming', true),
('pythonw.exe',       'Python (GUI)',      'programming', true),
('code.exe',          'VS Code',          'programming', true),
('sublime_text.exe',  'Sublime Text',     'programming', true),
('notepad++.exe',     'Notepad++',        'programming', true),
('atom.exe',          'Atom Editor',      'programming', true),
('idea64.exe',        'IntelliJ IDEA',    'programming', true),
('eclipse.exe',       'Eclipse IDE',      'programming', true),
('pycharm64.exe',     'PyCharm',          'programming', true),
('webstorm64.exe',    'WebStorm',         'programming', true),

-- Utilities
('notepad.exe',     'Notepad',     'utilities', true),
('calculator.exe',  'Calculator',  'utilities', true),
('calc.exe',        'Calc (Alt)',  'utilities', true)

ON CONFLICT (process_name) DO UPDATE SET
  display_name = EXCLUDED.display_name,
  category     = EXCLUDED.category,
  is_default   = EXCLUDED.is_default;


-- ============================================================================
-- 3. HELPER VIEW — for the Electron enforcement service to fetch
--    active (non-whitelisted) process names in one fast query
-- ============================================================================
CREATE OR REPLACE VIEW v_active_blacklist AS
SELECT process_name, category
FROM   app_blacklist
WHERE  is_whitelisted = false;
