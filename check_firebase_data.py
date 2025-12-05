import json
import requests

# Firebase configuration
FIREBASE_API_KEY = "AIzaSyDfZqVNgz3bGNi2vaxiw6EpgGMiH9Ieo1Y"
FIREBASE_DATABASE_URL = "https://dnd-initiative-roller-default-rtdb.firebaseio.com"

def authenticate_anonymously():
    """Authenticate anonymously with Firebase"""
    # Firebase REST API for anonymous authentication
    url = f"https://www.googleapis.com/identitytoolkit/v3/relyingparty/signupNewUser?key={FIREBASE_API_KEY}"
    headers = {"Content-Type": "application/json"}
    data = {"returnSecureToken": True}
    
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

def check_for_artifacts(data):
    """Check for common data artifacts"""
    issues = []
    
    if not data or 'campaigns' not in data:
        print("No campaigns found in database")
        return
    
    print("\n=== CHECKING DATABASE FOR ARTIFACTS ===\n")
    
    for campaign_id, campaign in data['campaigns'].items():
        print(f"\nCampaign: {campaign_id}")
        print(f"  Name: {campaign.get('meta', {}).get('name', 'Unknown')}")
        
        if 'data' not in campaign or 'combatants' not in campaign['data']:
            print("  ⚠️  No combatants data found")
            continue
        
        combatants = campaign['data']['combatants']
        
        # Handle if combatants is an object instead of array
        if isinstance(combatants, dict):
            combatants = list(combatants.values())
        
        print(f"  Total combatants: {len(combatants)}")
        
        for i, combatant in enumerate(combatants):
            if combatant is None:
                issues.append(f"  ⚠️  Combatant {i} is null")
                continue
            
            name = combatant.get('name', 'Unknown')
            print(f"\n  Combatant {i+1}: {name}")
            
            # Check for missing lucky properties
            if 'lucky' not in combatant:
                issues.append(f"    ⚠️  Missing 'lucky' property")
                print(f"    ⚠️  Missing 'lucky' property")
            else:
                print(f"    ✓ lucky: {combatant.get('lucky')}")
            
            if 'luckyReroll' not in combatant:
                issues.append(f"    ⚠️  Missing 'luckyReroll' property")
                print(f"    ⚠️  Missing 'luckyReroll' property")
            else:
                print(f"    ✓ luckyReroll: {combatant.get('luckyReroll')}")
            
            if 'luckyUsed' not in combatant:
                issues.append(f"    ⚠️  Missing 'luckyUsed' property")
                print(f"    ⚠️  Missing 'luckyUsed' property")
            else:
                print(f"    ✓ luckyUsed: {combatant.get('luckyUsed')}")
            
            # Check for undefined values (shouldn't exist in JSON but check anyway)
            for key, value in combatant.items():
                if value == "undefined":
                    issues.append(f"    ⚠️  Property '{key}' has 'undefined' string value")
                    print(f"    ⚠️  Property '{key}' has 'undefined' string value")
    
    print("\n=== SUMMARY ===")
    if issues:
        print(f"\n⚠️  Found {len(issues)} issues:")
        for issue in issues:
            print(issue)
    else:
        print("\n✓ No artifacts found! Database looks clean.")
    
    return data

def main():
    print("Firebase Database Checker")
    print("=" * 50)
    
    print("\nUsing Firebase API Key from configuration...")
    print("Database:", FIREBASE_DATABASE_URL)
    
    print("\nAuthenticating with Firebase...")
    id_token = authenticate_anonymously()
    
    if not id_token:
        print("❌ Authentication failed")
        return
    
    print("✓ Authentication successful")
    print("\nFetching database data...")
    
    data = fetch_database_data(id_token)
    
    if data:
        print("✓ Data retrieved successfully")
        
        # Save full data to file for review
        with open('firebase_data_export.json', 'w') as f:
            json.dump(data, f, indent=2)
        print("\n✓ Full data saved to: firebase_data_export.json")
        
        # Check for artifacts
        check_for_artifacts(data)
    else:
        print("❌ Failed to retrieve data")

if __name__ == "__main__":
    main()
