# D&D Initiative Roller

A free, multi-device D&D initiative tracker that re-rolls initiative every round. Perfect for DMs who want dynamic combat encounters accessible on tablets, TVs, and multiple devices simultaneously.

## Features

- 🎲 **One-click re-roll** - Re-roll all initiatives with a single button
- 📱 **Multi-device support** - Access from any device with a web browser
- 💾 **Persistent storage** - Your combatants are saved automatically using LocalStorage
- 🎯 **Initiative modifiers** - Set individual modifiers for each character
- 🔄 **Round tracking** - Keep track of combat rounds
- 🎨 **Color-coded** - Easy visual distinction between party members and enemies
- 📊 **Auto-sorted** - Initiative order automatically sorted from highest to lowest

## How to Use

### Running Locally

1. Open `index.html` in any web browser (Chrome, Firefox, Safari, Edge)
2. Add party members and enemies with their initiative modifiers
3. Click "Re-roll All Initiative" to roll for everyone
4. Use "Next Round" to advance rounds and automatically re-roll

### Multi-Device Access (Free Hosting)

#### Option 1: GitHub Pages (Recommended)

1. Create a GitHub account (free) at https://github.com
2. Create a new repository called `dnd-initiative`
3. Upload `index.html`, `styles.css`, and `app.js` to the repository
4. Go to Settings → Pages
5. Select "Deploy from a branch" and choose `main` branch
6. Your app will be available at `https://yourusername.github.io/dnd-initiative`

Now you can access this URL from your tablet, TV browser, or any device!

#### Option 2: Netlify Drop (Even Easier)

1. Go to https://app.netlify.com/drop
2. Drag and drop all three files (`index.html`, `styles.css`, `app.js`)
3. Get an instant URL to share across all your devices

### Syncing Across Devices

**Note:** This version uses LocalStorage, so each device maintains its own state. To sync:
- Manually add combatants on each device once
- Click "Re-roll All Initiative" on your main device
- Refresh other devices and click "Re-roll" to get new rolls

For automatic real-time sync, see the "Advanced Setup" section below.

## Controls

- **Re-roll All Initiative** - Rolls d20 + modifier for every combatant
- **Next Round** - Advances to the next round and re-rolls initiative
- **Reset to Round 1** - Resets round counter and re-rolls
- **Add Combatant** - Add new party members or enemies
- **Remove** - Delete a specific combatant
- **Clear All Combatants** - Remove everyone (with confirmation)

## Tips for DMs

- Add all your party members once - they'll persist between sessions
- For multiple enemies of the same type, add them as "Goblin 1", "Goblin 2", etc.
- Use tablet in portrait mode for easy touch controls
- TV browsers work great - just navigate to your hosted URL

## Advanced Setup: Real-Time Sync (Optional)

If you want automatic syncing across devices without manual refresh:

1. Sign up for Firebase (free tier): https://firebase.google.com/
2. Create a new project
3. Enable Realtime Database
4. Add Firebase SDK to `index.html`
5. Replace LocalStorage calls with Firebase Realtime Database calls

This keeps everything free while adding real-time sync functionality.

## Browser Compatibility

Works on:
- Chrome, Edge, Firefox, Safari (desktop & mobile)
- iOS Safari (iPhone/iPad)
- Android Chrome
- Samsung Internet
- LG/Samsung TV browsers

## License

Free to use, modify, and share for your D&D games!
