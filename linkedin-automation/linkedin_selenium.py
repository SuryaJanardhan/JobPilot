#!/usr/bin/env python3
"""
LinkedIn Connection Automation using Selenium
Browser-based automation that works with LinkedIn's current interface.
"""

import os
import sys
import time
import argparse
import pandas as pd
import re
import random
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.common.exceptions import TimeoutException, NoSuchElementException


def extract_public_id(linkedin_url):
    """Extract public_id from LinkedIn URL."""
    if not linkedin_url or pd.isna(linkedin_url):
        return None
    match = re.search(r'linkedin\.com/in/([^/?]+)', str(linkedin_url))
    return match.group(1) if match else None


def load_profiles_from_excel(excel_path, limit=20):
    """Load profiles from Excel file that haven't been contacted yet."""
    df = pd.read_excel(excel_path)
    
    # Filter rows where Status is empty/NaN (not contacted yet)
    unsent = df[df['Status'].isna() | (df['Status'] == '')]
    
    profiles = []
    for _, row in unsent.head(limit).iterrows():
        public_id = extract_public_id(row.get('Linkedin URL', ''))
        if public_id:
            profiles.append({
                'name': row.get('Name', 'Unknown'),
                'public_id': public_id,
                'company': row.get('Company Name', 'N/A'),
                'linkedin_url': row.get('Linkedin URL', ''),
                'row_index': row.name
            })
    
    return df, profiles


def update_excel_status(excel_path, df, row_index, status, delivered=''):
    """Update the Status and Delivered columns in Excel."""
    df.at[row_index, 'Status'] = status
    if delivered:
        df.at[row_index, 'Delivered'] = delivered
    df.to_excel(excel_path, index=False)


def setup_driver(headless=True):
    """Set up Chrome WebDriver."""
    options = Options()
    if headless:
        options.add_argument('--headless=new')
    options.add_argument('--no-sandbox')
    options.add_argument('--disable-dev-shm-usage')
    options.add_argument('--disable-blink-features=AutomationControlled')
    options.add_argument('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    options.add_experimental_option('excludeSwitches', ['enable-automation'])
    options.add_experimental_option('useAutomationExtension', False)
    
    driver = webdriver.Chrome(options=options)
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")
    return driver


def linkedin_login(driver, email, password):
    """Login to LinkedIn."""
    driver.get('https://www.linkedin.com/login')
    time.sleep(2)
    
    try:
        # Enter email
        email_field = WebDriverWait(driver, 10).until(
            EC.presence_of_element_located((By.ID, 'username'))
        )
        email_field.clear()
        email_field.send_keys(email)
        
        # Enter password
        password_field = driver.find_element(By.ID, 'password')
        password_field.clear()
        password_field.send_keys(password)
        
        # Click login button
        login_button = driver.find_element(By.XPATH, '//button[@type="submit"]')
        login_button.click()
        
        # Wait for login to complete
        time.sleep(3)
        
        # Check if login successful (look for feed or profile)
        if 'feed' in driver.current_url or 'mynetwork' in driver.current_url:
            return True
        
        # Check for security verification
        if 'checkpoint' in driver.current_url or 'challenge' in driver.current_url:
            print("⚠️ Security verification required. Please complete it manually.")
            return False
            
        return True
        
    except Exception as e:
        print(f"Login error: {e}")
        return False


def send_connection_request(driver, public_id, message=''):
    """Send connection request to a LinkedIn profile."""
    profile_url = f'https://www.linkedin.com/in/{public_id}/'
    driver.get(profile_url)
    time.sleep(random.uniform(3, 5))
    
    # Scroll down a bit to close any overlays
    driver.execute_script("window.scrollBy(0, 300)")
    time.sleep(1)
    
    try:
        # Look for Connect button with various selectors
        connect_button = None
        
        # Method 1: Find by aria-label containing "Invite"
        buttons = driver.find_elements(By.XPATH, '//button[contains(@aria-label, "Invite") and contains(@aria-label, "connect")]')
        if buttons:
            connect_button = buttons[0]
        
        # Method 2: Look for button with text "Connect"  
        if not connect_button:
            buttons = driver.find_elements(By.XPATH, '//button//span[text()="Connect"]/ancestor::button')
            if buttons:
                connect_button = buttons[0]
        
        # Method 3: Try More menu
        if not connect_button:
            more_buttons = driver.find_elements(By.XPATH, '//button[contains(@aria-label, "More action")]')
            if more_buttons:
                driver.execute_script("arguments[0].click();", more_buttons[0])
                time.sleep(1)
                menu_items = driver.find_elements(By.XPATH, '//div[contains(@class, "artdeco-dropdown__content")]//span[text()="Connect"]/ancestor::div[@role="button" or @role="menuitem"]')
                if menu_items:
                    driver.execute_script("arguments[0].click();", menu_items[0])
                    time.sleep(1)
                    # Now handle the modal
                    return handle_connection_modal(driver, message)
        
        if not connect_button:
            # Check if already connected
            if driver.find_elements(By.XPATH, '//button//span[text()="Message"]'):
                return 'already_connected'
            if driver.find_elements(By.XPATH, '//button//span[text()="Pending"]'):
                return 'pending'
            return 'no_connect_button'
        
        # Scroll to the button
        driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", connect_button)
        time.sleep(0.5)
        
        # Click using JavaScript to bypass overlays
        driver.execute_script("arguments[0].click();", connect_button)
        time.sleep(1)
        
        return handle_connection_modal(driver, message)
            
    except Exception as e:
        return f'error: {str(e)[:100]}'


def handle_connection_modal(driver, message):
    """Handle the connection request modal."""
    try:
        # Wait for modal to appear
        time.sleep(1)
        
        # Check for "Add a note" button
        add_note_btns = driver.find_elements(By.XPATH, '//button[contains(@aria-label, "Add a note")]')
        
        if add_note_btns and message:
            driver.execute_script("arguments[0].click();", add_note_btns[0])
            time.sleep(0.5)
            
            # Find and fill the message textarea
            textareas = driver.find_elements(By.XPATH, '//textarea[contains(@name, "message") or contains(@id, "custom-message")]')
            if textareas:
                textareas[0].clear()
                textareas[0].send_keys(message[:300])
                time.sleep(0.5)
        
        # Click Send button
        send_btns = driver.find_elements(By.XPATH, '//button[contains(@aria-label, "Send")]')
        if not send_btns:
            send_btns = driver.find_elements(By.XPATH, '//button//span[text()="Send"]/ancestor::button')
        if not send_btns:
            send_btns = driver.find_elements(By.XPATH, '//button[contains(@class, "artdeco-button--primary")]')
        
        if send_btns:
            driver.execute_script("arguments[0].click();", send_btns[0])
            time.sleep(1)
            return 'sent'
        
        return 'sent_maybe'
        
    except Exception as e:
        # Try to close modal
        try:
            dismiss = driver.find_elements(By.XPATH, '//button[contains(@aria-label, "Dismiss")]')
            if dismiss:
                dismiss[0].click()
        except:
            pass
        return f'modal_error: {str(e)[:50]}'


def main():
    parser = argparse.ArgumentParser(description='LinkedIn Connection Automation (Selenium)')
    parser.add_argument('--email', required=True, help='LinkedIn email')
    parser.add_argument('--password', required=True, help='LinkedIn password')
    parser.add_argument('--excel', default='linkedin-data.xlsx', help='Excel file path')
    parser.add_argument('--limit', type=int, default=20, help='Max connections to send')
    parser.add_argument('--message', default='', help='Connection message (max 300 chars)')
    parser.add_argument('--headless', action='store_true', help='Run in headless mode')
    
    args = parser.parse_args()
    
    script_dir = os.path.dirname(os.path.abspath(__file__))
    excel_path = os.path.join(script_dir, args.excel)
    
    print("=" * 60)
    print("🔗 LINKEDIN CONNECTION AUTOMATION (SELENIUM)")
    print("=" * 60)
    print(f"Email: {args.email}")
    print(f"Excel: {args.excel}")
    print(f"Limit: {args.limit}")
    print(f"Headless: {args.headless}")
    print()
    
    if not args.message:
        args.message = (
            "Hi! I'm a motivated engineer looking for SDE/Full Stack/AI roles. "
            "I'd love to connect and learn about opportunities at your company. "
            "Thank you!"
        )
    
    try:
        # Load profiles
        print(f"📂 Loading profiles from {args.excel}...")
        df, profiles = load_profiles_from_excel(excel_path, args.limit)
        print(f"📋 Found {len(profiles)} profiles to contact\n")
        
        if not profiles:
            print("⚠️ No unsent profiles found in Excel. All done!")
            return
        
        # Set up browser
        print("🌐 Starting browser...")
        driver = setup_driver(headless=args.headless)
        
        # Login
        print("🔐 Logging in to LinkedIn...")
        if not linkedin_login(driver, args.email, args.password):
            print("❌ Login failed")
            driver.quit()
            sys.exit(1)
        print("✅ Login successful!\n")
        
        # Process profiles
        success_count = 0
        failure_count = 0
        start_time = time.time()
        
        for i, profile in enumerate(profiles, 1):
            name = profile['name']
            public_id = profile['public_id']
            company = profile['company']
            row_index = profile['row_index']
            
            print(f"\n[{i}/{len(profiles)}] {name}")
            print(f"  🏢 {company}")
            print(f"  🔗 {public_id}")
            
            result = send_connection_request(driver, public_id, args.message)
            
            if result == 'sent' or result == 'sent_maybe':
                print(f"  ✅ Connection request sent!")
                success_count += 1
                update_excel_status(excel_path, df, row_index, 'sent', 'pending')
            elif result == 'already_connected':
                print(f"  ℹ️ Already connected")
                update_excel_status(excel_path, df, row_index, 'already_connected', '')
            elif result == 'pending':
                print(f"  ℹ️ Request already pending")
                update_excel_status(excel_path, df, row_index, 'pending', '')
            else:
                print(f"  ❌ Failed: {result}")
                failure_count += 1
                update_excel_status(excel_path, df, row_index, 'failed', result[:50])
            
            # Random delay to avoid detection
            if i < len(profiles):
                delay = random.uniform(5, 12)
                print(f"  ⏳ Waiting {delay:.1f}s...")
                time.sleep(delay)
        
        driver.quit()
        
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
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == '__main__':
    main()
