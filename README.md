# D&D Initiative Roller

A powerful, multi-device D&D initiative tracker with real-time Firebase sync, campaign management, and advanced D&D 5e mechanics. Perfect for DMs who want dynamic combat encounters accessible on tablets, TVs, and multiple devices simultaneously.

## Features

### Core Initiative System
- **One-click re-roll** - Re-roll all initiatives with a single button
- **Smart sorting** - Auto-sorted by initiative, with dex tiebreakers and player priority
- **Round tracking** - Keep track of combat rounds with automatic re-rolling
- **Advantage/Disadvantage** - Full support for advantage and disadvantage rolls
- **Dexterity + Modifiers** - Separate dex and modifier tracking for accurate initiative bonuses
- **Manual reordering** - Drag and drop to adjust initiative order as needed

### Lucky Feature (D&D 5e)
- **Halfling Lucky** - Automatically reroll natural 1s (racial trait)
- **Lucky Feat** - Manual reroll button appears when you roll a 1 (once per round)
- **Visual indicators** - See when Lucky was used and what was rerolled

### Campaign Management
- **Multiple campaigns** - Create and switch between different campaigns
- **Real-time Firebase sync** - All devices update instantly
- **Password protection** - Secure your campaigns with authentication
- **Multi-device support** - Access from tablets, phones, TVs, and computers
- **Auto-save** - Changes sync automatically across all devices

### Organization & UI
- **Party management** - Dedicated party member and ally tracking
- **Enemy tracking** - Quick add/duplicate for multiple enemies
- **History** - Review past initiative rolls from previous rounds
- **Color-coded** - Visual distinction between party, enemies, and allies
- **Theme switching** - Light and dark mode support
- **Responsive design** - Mobile-friendly with hamburger menu

## Quick Start

### Prerequisites
1. Set up a Firebase project (free):
   - Go to https://firebase.google.com/
   - Create a new project
   - Enable **Realtime Database** (use test mode for development)
   - Enable **Anonymous Authentication** under Authentication → Sign-in method
   
2. Add your Firebase configuration to `app.js`:
   - Replace the Firebase config object with your project's credentials
   - Find these in Firebase Console → Project Settings → General

### Running Locally

1. Start a local server (required for Firebase):
   ```bash
   python -m http.server 8000
   ```
   Or use any other local server

2. Open http://localhost:8000 in your browser

3. Enter the password (default: `dnd2025` - **change this in `app.js`**)

4. Create your first campaign and start adding combatants!

### Multi-Device Access (Hosting)

#### Option 1: Firebase Hosting (Recommended for Production)

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
firebase deploy
```

Your app will be available at `https://your-project.web.app`

#### Option 2: GitHub Pages

1. Fork this repository or create your own
2. Go to Settings → Pages
3. Deploy from main branch
4. Access at `https://yourusername.github.io/dnd-initiative-roller`

#### Option 3: Netlify

1. Go to https://app.netlify.com/drop
2. Drag and drop your project folder
3. Get an instant URL

### Real-Time Sync

All devices connected to the same campaign sync automatically:
- Adding/removing combatants
- Initiative rolls
- Round changes
- Manual reordering
- All updates appear instantly on all devices

## Controls & Features

### Main Controls
- **Re-roll All Initiative** - Rolls d20 + dex + modifier for every combatant
- **Next Round** - Advances to the next round and re-rolls initiative
- **Reset to Round 1** - Resets round counter to 1 and re-rolls
- **Clear Enemies** - Removes all enemies (keeps party and allies)

### Managing Combatants

#### Party Members & Allies
1. Click **Manage Party** in the menu
2. Click **Add Party / Ally**
3. Enter:
   - Name
   - Dexterity score
   - Initiative modifier
   - Type (Party Member or Ally)
   - Advantage/Disadvantage setting
   - Lucky feature (None, Halfling, or Feat)
4. Edit anytime by clicking the ✏️ button

#### Enemies
1. Use the **Add Enemy** form on the main screen
2. Enter name, dex, modifier, and advantage setting
3. Click **Copy** to duplicate enemies quickly
4. Enemies can't have Lucky features (party/allies only)

### Campaign Management
- **Campaign Dropdown** - Switch between campaigns
- **Manage Campaigns** - Create, rename, or delete campaigns
- Each campaign maintains its own combatants and history

### Initiative Order
- **Drag to reorder** - Manually adjust initiative by dragging combatants
- **Lucky (Feat) button** - Appears on party/allies with Lucky Feat when they roll a 1
- **Color-coded borders**:
  - Green = Party members
  - Cyan = Allies
  - Red = Enemies

### History & Themes
- **History** - View past rounds and initiative rolls
- **Light/Dark Theme** - Toggle in the menu (saved per device)
- **Logout** - Clear authentication (requires password re-entry)

## Tips for DMs

### Setup
- **Change the password** in `app.js` (line 15: `APP_PASSWORD`) before deploying
- Create separate campaigns for different adventures or sessions
- Add all party members once - they persist across sessions
- Set up party members with Lucky features (Halflings get Lucky-H, anyone can have Lucky-F feat)

### During Combat
- Use the **Copy** button to quickly duplicate enemies
- Drag combatants to manually adjust initiative order if needed
- Click **History** to review what happened in previous rounds
- The Lucky (Feat) button only appears when someone with the feat rolls a 1

### Multi-Device Usage
- Open on your DM laptop/tablet for control
- Display on a TV for players to see initiative order
- Players can view on their phones (read-only unless they have the password)
- All devices sync in real-time automatically

### Advanced
- Dexterity breaks initiative ties automatically
- When dex is also tied, player types (party/allies) go before enemies
- Manual reordering preserves across re-rolls until you click "Next Round"
- History is kept for the last 20 rounds per campaign

## Firebase Setup Details

### Security Rules

Create these rules in Firebase Console → Realtime Database → Rules:

```json
{
  "rules": {
    "campaigns": {
      "$campaignId": {
        ".read": "auth != null",
        ".write": "auth != null"
      }
    }
  }
}
```

### Authentication

The app uses Firebase Anonymous Authentication. Users must:
1. Enter the app password (set in `app.js`)
2. Authenticate with Firebase anonymously
3. Access is then granted to all campaigns

Change the password in `app.js`:
```javascript
const APP_PASSWORD = 'your-password-here';
```

### Database Structure

```
campaigns/
  {campaign-id}/
    meta/
      name: "Campaign Name"
      lastUpdated: timestamp
    data/
      combatants: [...]
      currentRound: number
      initiativeHistory: [...]
```

### Costs

Firebase free tier includes:
- 1 GB stored data
- 10 GB/month downloaded
- 100 simultaneous connections

This is more than enough for typical D&D usage!

## Technical Details

### Files
- `index.html` - Main HTML structure
- `styles.css` - Responsive styling for light/dark themes
- `app.js` - All application logic and Firebase integration
- `firebase.json` - Firebase hosting configuration
- `FIREBASE_RULES.txt` - Database security rules reference

### Features Breakdown
- **Initiative Rolling**: d20 + dexterity + modifier, with advantage/disadvantage support
- **Lucky Mechanics**:
  - Halfling Lucky: Auto-rerolls 1s (shows "Lucky (Halfling): 1 → X")
  - Lucky Feat: Manual reroll button on 1s (shows "Lucky (Feat): 1 → X")
- **Tiebreakers**: Initiative → Dexterity → Player Types (party/allies before enemies)
- **Persistence**: Real-time Firebase sync + device-specific theme preferences
- **History**: Last 20 rounds per campaign with full roll details

### Browser Compatibility

Tested and working on:
- Chrome, Edge, Firefox, Safari (desktop & mobile)
- iOS Safari (iPhone/iPad)
- Android Chrome
- Samsung Internet
- LG/Samsung/Sony TV browsers

Requires JavaScript enabled and localStorage support.

## Troubleshooting

### "Undefined" showing in rolls
- This was fixed in recent updates. Pull latest code and refresh.
- Existing data will be automatically migrated.

### Firebase connection issues
- Check that Anonymous Authentication is enabled
- Verify your Firebase config in `app.js` is correct
- Check browser console for specific error messages
- Ensure database rules allow authenticated reads/writes

### Password not working
- Make sure you changed `APP_PASSWORD` in `app.js`
- Clear browser cache and try again
- Check that "Remember Me" didn't save an old token

## Contributing

Feel free to fork and submit pull requests! This is a community project for D&D players.

## License

Free to use, modify, and share for your D&D games!
