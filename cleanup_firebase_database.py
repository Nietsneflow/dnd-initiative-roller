import getpass
import requests
import json

# Firebase Configuration
FIREBASE_API_KEY = "AIzaSyDfZqVNgz3bGNi2vaxiw6EpgGMiH9Ieo1Y"
FIREBASE_DATABASE_URL = "https://dnd-initiative-roller-default-rtdb.firebaseio.com"
# Same shared account the app signs in with (AUTH_EMAIL in app.js). The
# password is prompted at runtime - never store it in this file.
AUTH_EMAIL = "dm@dnd-initiative-roller.firebaseapp.com"

def authenticate():
    """Sign in with the shared email/password account via the Firebase REST API"""
    password = getpass.getpass(f"Password for {AUTH_EMAIL}: ")
    url = f"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_API_KEY}"
    headers = {"Content-Type": "application/json"}
    data = {"email": AUTH_EMAIL, "password": password, "returnSecureToken": True}

    response = requests.post(url, headers=headers, json=data)
    if response.status_code == 200:
        auth_data = response.json()
        return auth_data.get('idToken')
    else:
        print(f"Authentication failed: {response.text}")
        return None

def fetch_database_data(id_token):
    """Fetch all data from Firebase"""
    url = f"{FIREBASE_DATABASE_URL}/.json?auth={id_token}"
    response = requests.get(url)
    
    if response.status_code == 200:
        return response.json()
    else:
        print(f"Failed to fetch data: {response.text}")
        return None

def update_combatant(id_token, campaign_id, combatant_index, updates):
    """Update a specific combatant with missing properties"""
    url = f"{FIREBASE_DATABASE_URL}/campaigns/{campaign_id}/data/combatants/{combatant_index}.json?auth={id_token}"
    response = requests.patch(url, json=updates)
    
    if response.status_code == 200:
        return True
    else:
        print(f"Failed to update combatant: {response.text}")
        return False

def cleanup_database(id_token, data):
    """Add missing Lucky properties to all combatants"""
    total_updates = 0
    failed_updates = 0
    
    campaigns = data.get('campaigns', {})
    
    for campaign_id, campaign_data in campaigns.items():
        campaign_name = campaign_data.get('name', 'Unknown')
        # Combatants are in data.combatants array
        combatants = campaign_data.get('data', {}).get('combatants', [])
        
        print(f"\n📋 Campaign: {campaign_name} ({campaign_id})")
        print(f"   Found {len(combatants)} combatants")
        
        for index, combatant in enumerate(combatants):
            updates = {}
            
            # Add missing properties with default values
            if 'lucky' not in combatant:
                updates['lucky'] = None
            if 'luckyReroll' not in combatant:
                updates['luckyReroll'] = None
            if 'luckyUsed' not in combatant:
                updates['luckyUsed'] = False
            
            # Only update if there are missing properties
            if updates:
                combatant_name = combatant.get('name', 'Unknown')
                print(f"   ↻ Updating {combatant_name}... ", end='')
                
                if update_combatant(id_token, campaign_id, index, updates):
                    print("✓")
                    total_updates += 1
                else:
                    print("✗")
                    failed_updates += 1
    
    return total_updates, failed_updates

def main():
    print("=" * 60)
    print("Firebase Database Cleanup Tool")
    print("=" * 60)
    print("\nThis script will add missing Lucky properties to all combatants:")
    print("  - lucky: null")
    print("  - luckyReroll: null")
    print("  - luckyUsed: false")
    print()
    
    # Authenticate
    print("🔐 Authenticating with Firebase...")
    id_token = authenticate()
    if not id_token:
        print("\n❌ Authentication failed. Exiting.")
        return
    
    print("✓ Authentication successful\n")
    
    # Fetch current data
    print("📥 Fetching current database state...")
    data = fetch_database_data(id_token)
    if not data:
        print("\n❌ Failed to fetch data. Exiting.")
        return
    
    print("✓ Data retrieved successfully\n")
    
    # Confirm before proceeding
    campaigns = data.get('campaigns', {})
    total_combatants = sum(len(c.get('data', {}).get('combatants', [])) for c in campaigns.values())
    
    print(f"Found {len(campaigns)} campaigns with {total_combatants} total combatants")
    response = input("\n⚠️  Proceed with cleanup? (yes/no): ")
    
    if response.lower() not in ['yes', 'y']:
        print("\n❌ Cleanup cancelled.")
        return
    
    # Perform cleanup
    print("\n🧹 Starting cleanup...")
    total_updates, failed_updates = cleanup_database(id_token, data)
    
    # Summary
    print("\n" + "=" * 60)
    print("CLEANUP SUMMARY")
    print("=" * 60)
    print(f"✓ Successfully updated: {total_updates} combatants")
    if failed_updates > 0:
        print(f"✗ Failed updates: {failed_updates} combatants")
    else:
        print("✓ No errors encountered")
    print()
    
    if total_updates > 0:
        print("✅ Database cleanup complete!")
        print("\nRun check_firebase_data.py to verify all artifacts are resolved.")
    else:
        print("ℹ️  No updates were needed - database is already clean!")

if __name__ == "__main__":
    main()
