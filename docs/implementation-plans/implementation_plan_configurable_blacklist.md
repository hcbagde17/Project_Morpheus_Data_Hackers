# Implementation Plan: Configurable Process Blacklist System

## Overview

Implement a comprehensive, admin-configurable process blacklist system with:
1. **Expanded Default Blacklist**: 35+ applications (browsers, VPNs, communication apps)
2. **Admin Dashboard**: UI for managing blacklist/whitelist per institution
3. **Two-Phase Enforcement**:
   - **Pre-Exam**: Kill all blacklisted processes before exam starts
   - **During Exam**: Detect and FLAG (not kill) if processes appear

---

## Part 1: Expanded Process Blacklist

### 1.1 Complete Application List

#### Browsers (15 apps)
```javascript
const BROWSERS = [
    'chrome.exe',
    'firefox.exe',
    'msedge.exe',
    'msedge_proxy.exe',      // Edge helper
    'safari.exe',
    'opera.exe',
    'brave.exe',
    'vivaldi.exe',
    'tor.exe',
    'firefox.exe',           // Tor uses Firefox
    'arc.exe',
    'chromium.exe',
    'waterfox.exe',
    'palemoon.exe',
    'maxthon.exe',
    'ucbrowser.exe',
    'browser.exe',           // Yandex
];
```

#### VPN Services (15 apps)
```javascript
const VPN_APPS = [
    'nordvpn.exe',
    'nordvpn-service.exe',
    'expressvpn.exe',
    'expressvpnd.exe',
    'surfshark.exe',
    'protonvpn.exe',
    'cyberghost.exe',
    'pia-client.exe',        // Private Internet Access
    'ipvanish.exe',
    'windscribe.exe',
    'tunnelbear.exe',
    'hss-update.exe',        // Hotspot Shield
    'mullvad-vpn.exe',
    'atlasvpn.exe',
    'hide.me.exe',
    'purevpn.exe',
    'vyprvpn.exe',
];
```

#### Communication Apps (5 apps - new additions)
```javascript
const COMMUNICATION_APPS = [
    'telegram.exe',
    'instagram.exe',
    'whatsapp.exe',
    'whatsappdesktop.exe',
    // 'discord.exe',        // Already in existing blacklist
    'snapchat.exe',
];
```

---

## Part 2: Database Schema

### 2.1 New Table: `app_blacklist`

```sql
CREATE TABLE app_blacklist (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    institution_id UUID REFERENCES institutions(id) ON DELETE CASCADE,
    app_name VARCHAR(255) NOT NULL,              -- e.g., 'chrome.exe'
    display_name VARCHAR(255),                   -- e.g., 'Google Chrome'
    category VARCHAR(50),                        -- 'browser', 'vpn', 'communication', 'custom'
    is_default BOOLEAN DEFAULT false,            -- True for system defaults
    is_whitelisted BOOLEAN DEFAULT false,        -- Admin can whitelist
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    
    UNIQUE(institution_id, app_name)
);

-- Index for fast lookup
CREATE INDEX idx_app_blacklist_institution ON app_blacklist(institution_id);
CREATE INDEX idx_app_blacklist_category ON app_blacklist(category);
```

### 2.2 Seed Default Blacklist

```sql
-- Insert system defaults (institution_id = NULL for global defaults)
INSERT INTO app_blacklist (app_name, display_name, category, is_default) VALUES
    -- Browsers
    ('chrome.exe', 'Google Chrome', 'browser', true),
    ('firefox.exe', 'Mozilla Firefox', 'browser', true),
    ('msedge.exe', 'Microsoft Edge', 'browser', true),
    -- ... (all 35+ apps)
    
    -- VPNs
    ('nordvpn.exe', 'NordVPN', 'vpn', true),
    -- ... (all VPN apps)
    
    -- Communication
    ('telegram.exe', 'Telegram', 'communication', true);
    -- ... (all communication apps)
```

### 2.3 Row-Level Security (RLS)

```sql
-- Admins can view/edit their institution's blacklist
CREATE POLICY "Admins manage blacklist"
ON app_blacklist
FOR ALL
USING (
    (auth.jwt() ->> 'role')::text = 'admin' AND
    institution_id = (auth.jwt() ->> 'institution_id')::uuid
);

-- Students/Teachers read-only access
CREATE POLICY "Users view blacklist"
ON app_blacklist
FOR SELECT
USING (
    institution_id = (auth.jwt() ->> 'institution_id')::uuid
);
```

---

## Part 3: Admin Dashboard UI

### 3.1 Blacklist Management Page

**Route**: `/admin/settings/blacklist`

**Features**:
- View all blacklisted apps (categorized tabs: All, Browsers, VPNs, Communication, Custom)
- Search/filter apps by name
- Toggle whitelist status (green checkmark = allowed)
- Add custom app to blacklist (manual entry)
- Remove custom apps (can't remove defaults)

**UI Components**:

```jsx
// AdminBlacklistManager.jsx
import { useState, useEffect } from 'react';
import { Box, Tabs, Tab, TextField, IconButton, Chip, Switch } from '@mui/material';
import { Add, Delete, Search } from '@mui/icons-material';

export default function AdminBlacklistManager() {
    const [apps, setApps] = useState([]);
    const [category, setCategory] = useState('all');
    const [searchTerm, setSearchTerm] = useState('');

    // Load blacklist from Supabase
    // Filter by category and search term
    // Toggle whitelist status
    // Add/remove custom apps

    return (
        <Box>
            <Tabs value={category} onChange={(e, v) => setCategory(v)}>
                <Tab label="All" value="all" />
                <Tab label="Browsers" value="browser" />
                <Tab label="VPNs" value="vpn" />
                <Tab label="Communication" value="communication" />
                <Tab label="Custom" value="custom" />
            </Tabs>

            <TextField 
                placeholder="Search apps..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                startAdornment={<Search />}
            />

            {apps.map(app => (
                <Box key={app.id} sx={{ display: 'flex', alignItems: 'center', p: 1 }}>
                    <Typography>{app.display_name}</Typography>
                    <Chip label={app.category} size="small" />
                    <Switch 
                        checked={!app.is_whitelisted} 
                        onChange={() => toggleWhitelist(app.id)}
                        label={app.is_whitelisted ? 'Allowed' : 'Blocked'}
                    />
                    {!app.is_default && (
                        <IconButton onClick={() => deleteApp(app.id)}>
                            <Delete />
                        </IconButton>
                    )}
                </Box>
            ))}

            <Button onClick={() => setAddDialogOpen(true)}>
                <Add /> Add Custom App
            </Button>
        </Box>
    );
}
```

### 3.2 Add Custom App Dialog

```jsx
// AddAppDialog.jsx
<Dialog open={open} onClose={onClose}>
    <DialogTitle>Add Custom Application</DialogTitle>
    <DialogContent>
        <TextField 
            label="Process Name" 
            placeholder="example.exe"
            helperText="Exact name as it appears in Task Manager"
        />
        <TextField 
            label="Display Name" 
            placeholder="Example App"
        />
        <Select label="Category">
            <MenuItem value="custom">Custom</MenuItem>
            <MenuItem value="browser">Browser</MenuItem>
            <MenuItem value="vpn">VPN</MenuItem>
            <MenuItem value="communication">Communication</MenuItem>
        </Select>
    </DialogContent>
    <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={handleAdd} variant="contained">Add</Button>
    </DialogActions>
</Dialog>
```

---

## Part 4: API Endpoints

### 4.1 Get Blacklist (Renderer)

**IPC Channel**: `proctoring:get-blacklist`

```javascript
// In main.cjs
ipcMain.handle('proctoring:get-blacklist', async (event) => {
    const { data } = await supabase
        .from('app_blacklist')
        .select('*')
        .eq('institution_id', currentInstitutionId)
        .eq('is_whitelisted', false);  // Only get non-whitelisted
    
    return data.map(app => app.app_name);  // Return array of process names
});
```

### 4.2 Toggle Whitelist Status

**Supabase Function**: `toggle-blacklist`

```javascript
// supabase/functions/toggle-blacklist/index.ts
export default async function handler(req: Request) {
    const { app_id, is_whitelisted } = await req.json();
    
    // Update whitelist status
    const { data, error } = await supabase
        .from('app_blacklist')
        .update({ is_whitelisted, updated_at: new Date() })
        .eq('id', app_id)
        .select()
        .single();
    
    return new Response(JSON.stringify({ data, error }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
```

### 4.3 Add Custom App

**Frontend API Call**:
```javascript
async function addCustomApp(appData) {
    const { data, error } = await supabase
        .from('app_blacklist')
        .insert({
            institution_id: user.institution_id,
            app_name: appData.processName.toLowerCase(),
            display_name: appData.displayName,
            category: appData.category,
            is_default: false,
            is_whitelisted: false
        });
    
    return { data, error };
}
```

---

## Part 5: Enforcement Logic Changes

### 5.1 Two-Phase Enforcement Strategy

#### Phase 1: Pre-Exam Kill (PreTestCheck)

**When**: During "System Permissions" step in `PreTestCheck.jsx`

**Action**: Terminate ALL blacklisted processes

```javascript
// In PreTestCheck.jsx
async function runProcessCleanup() {
    setChecks(prev => ({ ...prev, processCleanup: 'pending' }));
    
    try {
        const result = await window.electronAPI.killBlacklistedProcesses();
        
        if (result.killedProcesses.length > 0) {
            console.log('Killed processes:', result.killedProcesses);
            setChecks(prev => ({ ...prev, processCleanup: 'success' }));
        } else {
            setChecks(prev => ({ ...prev, processCleanup: 'success' }));
        }
    } catch (err) {
        setChecks(prev => ({ ...prev, processCleanup: 'error' }));
    }
}
```

**UI Display**:
```jsx
<Box>
    <Typography variant="h6">Process Cleanup</Typography>
    {checks.processCleanup === 'pending' && (
        <CircularProgress />
    )}
    {checks.processCleanup === 'success' && (
        <Alert severity="success">
            All unauthorized applications closed
        </Alert>
    )}
    {checks.processCleanup === 'error' && (
        <Alert severity="error">
            Some applications could not be closed. Please close them manually.
        </Alert>
    )}
</Box>
```

#### Phase 2: During-Exam Detection (EnforcementService)

**When**: Continuously during exam (every 5 seconds)

**Action**: DETECT and FLAG (do NOT kill)

```javascript
// In EnforcementService.cjs
detectBlacklistedProcesses() {
    const si = require('systeminformation');
    si.processes().then(data => {
        data.list.forEach(p => {
            if (BLACKLIST.includes(p.name.toLowerCase())) {
                console.log(`[Enforcement] DETECTED forbidden app: ${p.name} (${p.pid})`);
                
                // DO NOT KILL - Just FLAG
                this.mainWindow.webContents.send('proctoring:violation', {
                    type: 'FORBIDDEN_PROCESS',
                    message: `Unauthorized application detected: ${p.name}`,
                    severity: 'high',  // RED FLAG
                    processName: p.name,
                    pid: p.pid
                });
            }
        });
    }).catch(err => console.error(err));
}
```

**Update Interval**:
```javascript
start() {
    // Change from killBlacklistedProcesses to detectBlacklistedProcesses
    this.intervals.push(setInterval(() => this.detectBlacklistedProcesses(), 5000));
    // ... rest of enforcement
}
```

---

## Part 6: IPC Updates

### 6.1 New IPC Handlers

**File**: `electron/main.cjs`

```javascript
// Pre-exam process kill (one-time)
ipcMain.handle('proctoring:kill-blacklisted-processes', async (event) => {
    const blacklist = await getInstitutionBlacklist();  // From database
    const killedProcesses = [];
    
    const si = require('systeminformation');
    const data = await si.processes();
    
    for (const proc of data.list) {
        if (blacklist.includes(proc.name.toLowerCase())) {
            try {
                await killProcess(proc.pid);
                killedProcesses.push(proc.name);
            } catch (err) {
                console.error(`Failed to kill ${proc.name}:`, err);
            }
        }
    }
    
    return { killedProcesses, totalKilled: killedProcesses.length };
});

// Get institution blacklist
ipcMain.handle('proctoring:get-blacklist', async (event) => {
    // Query Supabase for institution's blacklist
    // Return array of process names
});
```

### 6.2 Preload Exposure

**File**: `electron/preload.cjs`

```javascript
contextBridge.exposeInMainWorld('electronAPI', {
    // ... existing APIs
    
    // New APIs
    killBlacklistedProcesses: () => ipcRenderer.invoke('proctoring:kill-blacklisted-processes'),
    getBlacklist: () => ipcRenderer.invoke('proctoring:get-blacklist'),
});
```

---

## Part 7: Implementation Checklist

### Phase 1: Database (Week 1)
- [ ] Create `app_blacklist` table with RLS
- [ ] Seed default blacklist (35+ apps)
- [ ] Test RLS policies
- [ ] Create indexes

### Phase 2: Admin UI (Week 1-2)
- [ ] Create `AdminBlacklistManager.jsx` page
- [ ] Implement category tabs
- [ ] Implement search/filter
- [ ] Add toggle whitelist functionality
- [ ] Create "Add Custom App" dialog
- [ ] Add delete custom app feature
- [ ] Test CRUD operations

### Phase 3: Pre-Exam Enforcement (Week 2)
- [ ] Add process cleanup step to `PreTestCheck.jsx`
- [ ] Implement IPC handler for killing processes
- [ ] Test pre-exam process termination
- [ ] Add UI feedback for killed processes

### Phase 4: During-Exam Detection (Week 2-3)
- [ ] Update `EnforcementService.cjs` to detect (not kill)
- [ ] Change interval from 2s to 5s (less aggressive)
- [ ] Send RED FLAGS for detections
- [ ] Store violation in database with process name

### Phase 5: Integration & Testing (Week 3)
- [ ] Load institution blacklist from database
- [ ] Test admin whitelist override
- [ ] Test custom app additions
- [ ] Verify pre-exam kill works
- [ ] Verify during-exam flagging works
- [ ] Test with all 35+ apps

---

## Part 8: User Flows

### 8.1 Admin Flow

1. Admin logs in → Goes to Settings → Blacklist Management
2. Views default blacklist (35+ apps across categories)
3. **Option A**: Whitelist an app (e.g., allow Calculator for math exam)
   - Toggle switch → App moved to "Allowed" list
4. **Option B**: Add custom app (e.g., proprietary software)
   - Click "Add Custom App"
   - Enter process name (`mysoftware.exe`)
   - Select category
   - Save
5. Changes auto-sync to all exam sessions for that institution

### 8.2 Student Flow (Pre-Exam)

1. Student clicks "Start Exam"
2. `PreTestCheck` runs:
   - Camera check
   - Microphone check
   - **Process Cleanup** (NEW)
     - Scans for blacklisted apps
     - Kills Discord, Chrome, NordVPN, etc.
     - Shows "3 applications closed" message
3. Student proceeds to exam
4. If blacklisted app was running → Exam starts clean

### 8.3 Student Flow (During Exam)

1. Student is taking exam
2. Student tries to open Chrome (blacklisted)
3. **Scenario A**: Process kill disabled (new behavior)
   - Chrome opens successfully
   - EnforcementService detects it after 5s
   - **RED FLAG** logged to database
   - Student sees warning: "Unauthorized application detected"
   - Teacher/Admin sees flag in live monitoring
4. **Scenario B**: Student opens whitelisted app (Calculator)
   - No flag raised
   - Exam continues normally

---

## Part 9: Blacklist Categories Summary

| Category | Count | Examples | Default Action |
|----------|-------|----------|----------------|
| **Browsers** | 15 | Chrome, Firefox, Edge, Brave | Kill pre-exam, Flag during |
| **VPNs** | 15 | NordVPN, ExpressVPN, Surfshark | Kill pre-exam, Flag during |
| **Communication** | 5 | Telegram, WhatsApp, Instagram | Kill pre-exam, Flag during |
| **Remote Desktop** | 6 | TeamViewer, AnyDesk, mstsc | Kill pre-exam, Flag during |
| **Screen Recording** | 4 | OBS, ShareX, Bandicam | Kill pre-exam, Flag during |
| **AI Tools** | 3 | ChatGPT, Claude, Notion | Kill pre-exam, Flag during |
| **Programming** | 6 | VS Code, Python, Node, cmd | Kill pre-exam, Flag during |
| **System Tools** | 3 | Task Manager, procexp | Kill pre-exam, Blocked always |

**Total Default Blacklist**: ~57 applications

---

## Part 10: Success Criteria

✅ **Functional Requirements**:
- Admin can view/edit blacklist from dashboard
- Admin can add custom apps
- Admin can whitelist specific apps
- Pre-exam kills all blacklisted processes
- During exam, detection raises RED FLAG (no kill)

✅ **Performance Requirements**:
- Pre-exam kill completes in <5 seconds
- Detection scan every 5 seconds (20% CPU max)
- No false positives on whitelisted apps

✅ **Security Requirements**:
- RLS prevents students from modifying blacklist
- Only admins of institution can manage their blacklist
- Process names case-insensitive matching

---

## Part 11: Edge Cases & Considerations

### 11.1 VPN Detection False Positives

**Problem**: Corporate VPNs (company-mandated) might be flagged

**Solution**: Admin can whitelist specific VPN apps
- Example: `companyvpn.exe` → Add to whitelist

### 11.2 Browser Process Names Variation

**Problem**: Browsers have multiple processes (helper, GPU, etc.)

**Solution**: Use wildcard matching or process tree detection
```javascript
const isBrowserProcess = (name) => {
    return name.startsWith('chrome') || 
           name.startsWith('firefox') || 
           name.startsWith('msedge');
};
```

### 11.3 Rapid Process Restart

**Problem**: Student kills process during pre-exam, restarts during exam

**Current Behavior**: Detected and flagged within 5 seconds ✅

### 11.4 Process Name Spoofing

**Problem**: Student renames `chrome.exe` to `calculator.exe`

**Mitigation** (Phase 2):
- Check process signature/hash
- Verify process publisher (Microsoft, Google, etc.)

---

## Conclusion

This plan provides a comprehensive, production-ready solution for:
1. ✅ Expanded blacklist (57+ default apps)
2. ✅ Admin management UI
3. ✅ Pre-exam process cleanup
4. ✅ During-exam detection (not killing)
5. ✅ Configurable whitelist per institution

**Estimated Development Time**: 3 weeks

**Next Step**: User approval before implementation
