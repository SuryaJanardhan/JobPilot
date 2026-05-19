#!/usr/bin/env python3
"""
LinkedIn Connection Automation Script
Reads LinkedIn URLs from Excel file and sends connection requests.
"""

import os
import sys
import time
import argparse
import pandas as pd
import re
import tempfile

# Add the current inb directory to path
sys.path.insert(0, os.path.dirname(__file__))

from api.linkedin_api import LinkedIn
from api.invitation.status import Invitation, Person


def _script_path(filename):
    return os.path.join(os.path.dirname(os.path.abspath(__file__)), filename)


def _atomic_write_excel(df, excel_path):
    directory = os.path.dirname(os.path.abspath(excel_path))
    fd, temp_path = tempfile.mkstemp(prefix='.linkedin-', suffix='.xlsx', dir=directory)
    os.close(fd)
    try:
        df.to_excel(temp_path, index=False)
        os.replace(temp_path, excel_path)
    finally:
        if os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except OSError:
                pass


def extract_public_id(linkedin_url):
    """Extract public_id from LinkedIn URL."""
    if not linkedin_url or pd.isna(linkedin_url):
        return None
    # Pattern: linkedin.com/in/username or linkedin.com/in/username/
    match = re.search(r'linkedin\.com/in/([^/?]+)', str(linkedin_url))
    return match.group(1) if match else None


def load_profiles_from_excel(excel_path, limit=20):
    """Load profiles from Excel file that haven't been contacted yet."""
    if not os.path.exists(excel_path):
        raise FileNotFoundError(f'Excel file not found: {excel_path}')

    df = pd.read_excel(excel_path)
    required_columns = {'Name', 'Company Name', 'Linkedin URL', 'Status'}
    missing_columns = [column for column in required_columns if column not in df.columns]
    if missing_columns:
        raise ValueError(f"Excel file missing required columns: {missing_columns}")

    status_values = df['Status'].fillna('').astype(str).str.strip().str.lower()
    unsent = df[status_values == '']
    
    profiles = []
    for _, row in unsent.head(limit).iterrows():
        public_id = extract_public_id(row.get('Linkedin URL', ''))
        if public_id:
            profiles.append({
                'name': row.get('Name', 'Unknown'),
                'public_id': public_id,
                'company': row.get('Company Name', 'N/A'),
                'linkedin_url': row.get('Linkedin URL', ''),
                'row_index': row.name  # For updating later
            })
    
    return df, profiles


def update_excel_status(excel_path, df, row_index, status, delivered=''):
    """Update the Status and Delivered columns in Excel."""
    df.at[row_index, 'Status'] = status
    if delivered:
        df.at[row_index, 'Delivered'] = delivered
    _atomic_write_excel(df, excel_path)


def main():
    parser = argparse.ArgumentParser(description='LinkedIn Connection Automation')
    parser.add_argument('--email', required=True, help='LinkedIn email')
    parser.add_argument('--password', required=True, help='LinkedIn password')
    parser.add_argument('--excel', default='linkedin-data.xlsx', help='Excel file path')
    parser.add_argument('--limit', type=int, default=20, help='Max connections to send')
    parser.add_argument('--message', default='', help='Connection message (max 300 chars)')
    parser.add_argument('--refresh-cookies', action='store_true', help='Force refresh cookies')
    parser.add_argument('--nofollow', action='store_true', help='Unfollow after connecting')
    
    args = parser.parse_args()
    
    # Get Excel file path
    script_dir = os.path.dirname(os.path.abspath(__file__))
    excel_path = os.path.join(script_dir, args.excel)
    
    print("=" * 60)
    print("🔗 LINKEDIN CONNECTION AUTOMATION (FROM EXCEL)")
    print("=" * 60)
    print(f"Email: {args.email}")
    print(f"Excel: {args.excel}")
    print(f"Limit: {args.limit}")
    print()
    
    # Default connection message for job seekers
    if not args.message:
        args.message = (
            "Hi! I'm a motivated engineer looking for SDE/Full Stack/AI roles. "
            "I'd love to connect and learn about opportunities at your company. "
            "Thank you!"
        )
    
    try:
        # Load profiles from Excel
        print(f"📂 Loading profiles from {args.excel}...")
        df, profiles = load_profiles_from_excel(excel_path, args.limit)
        print(f"📋 Found {len(profiles)} profiles to contact\n")
        
        if not profiles:
            print("⚠️ No unsent profiles found in Excel. All done!")
            return
        
        # Initialize LinkedIn client
        print("🔐 Authenticating with LinkedIn...")
        try:
            linkedin = LinkedIn(
                args.email,
                args.password,
                authenticate=True,
                refresh_cookies=args.refresh_cookies,
                debug=True  # Enable debug for troubleshooting
            )
            print("✅ Authentication successful!\n")
        except Exception as auth_error:
            print(f"❌ Authentication failed: {type(auth_error).__name__}: {auth_error}")
            import traceback
            traceback.print_exc()
            sys.exit(1)
        
        # Send connection requests
        start_time = time.time()
        success_count = 0
        failure_count = 0
        
        for i, profile in enumerate(profiles, 1):
            name = profile['name']
            public_id = profile['public_id']
            company = profile['company']
            row_index = profile['row_index']
            
            print(f"\n[{i}/{len(profiles)}] {name}")
            print(f"  🏢 {company}")
            print(f"  🔗 {public_id}")
            
            try:
                # First, try to get the profile to see if they exist
                print(f"  📡 Fetching profile...")
                try:
                    profile_data = linkedin.get_profile(public_id=public_id)
                except KeyError as ke:
                    print(f"  ⚠️ Profile API error: KeyError {ke}")
                    failure_count += 1
                    update_excel_status(excel_path, df, row_index, 'api_error', str(ke))
                    continue
                except Exception as pe:
                    print(f"  ⚠️ Profile error: {type(pe).__name__}: {pe}")
                    failure_count += 1
                    update_excel_status(excel_path, df, row_index, 'error', str(pe)[:50])
                    continue
                
                if not profile_data:
                    print(f"  ⚠️ Profile not found or private")
                    failure_count += 1
                    update_excel_status(excel_path, df, row_index, 'not_found', '')
                    continue
                
                # Get profile URN for connection
                profile_urn = profile_data.get('profile_urn', '').split(':')[-1] if profile_data.get('profile_urn') else None
                
                if not profile_urn:
                    print(f"  ⚠️ Could not get profile URN")
                    failure_count += 1
                    update_excel_status(excel_path, df, row_index, 'no_urn', '')
                    continue
                
                # Send connection request
                success = linkedin.add_connection(
                    public_id,
                    message=args.message,
                    profile_urn=profile_urn  # Pass URN directly to avoid double fetch
                )
                
                if success:
                    print(f"  ✅ Connection request sent!")
                    success_count += 1
                    update_excel_status(excel_path, df, row_index, 'sent', 'pending')
                    
                    # Optionally unfollow
                    if args.nofollow:
                        try:
                            # Get profile to get urn_id for unfollowing
                            profile_data = linkedin.get_profile(public_id=public_id)
                            if profile_data and 'profile_urn' in profile_data:
                                urn_id = profile_data['profile_urn'].split(':')[-1]
                                linkedin.unfollow_connection(urn_id)
                                print(f"  👋 Unfollowed")
                        except:
                            pass
                else:
                    print(f"  ❌ Failed to send request")
                    failure_count += 1
                    update_excel_status(excel_path, df, row_index, 'failed', '')
                    
            except Exception as e:
                print(f"  ❌ Error: {str(e)}")
                failure_count += 1
                update_excel_status(excel_path, df, row_index, 'error', str(e)[:50])
            
            # Random delay to avoid rate limiting (3-7 seconds)
            if i < len(profiles):
                delay = 3 + (hash(name) % 5)  # Pseudo-random 3-7 seconds
                print(f"  ⏳ Waiting {delay}s...")
                time.sleep(delay)
        
        # Summary
        elapsed = time.time() - start_time
        print("\n" + "=" * 60)
        print("📊 SUMMARY")
        print("=" * 60)
        print(f"✅ Successful: {success_count}")
        print(f"❌ Failed: {failure_count}")
        print(f"⏱️ Time elapsed: {elapsed:.1f}s")
        print(f"📁 Excel updated: {args.excel}")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        sys.exit(1)


if __name__ == '__main__':
    main()
